const videoGrid = document.getElementById('video-grid');
const myIdDisplay = document.getElementById('my-id-display');
const sharedNotes = document.getElementById('shared-notes');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

let peer = null, dataPeers = {}, calls = {};
let isDrawing = false, lx = 0, ly = 0, tool = 'pen';
let students = JSON.parse(localStorage.getItem('destiny_accounts') || '{}');

// Pre-fill Test Accounts
if (Object.keys(students).length === 0) {
    students = {
        "STU01": { name: "Rahul (Test)", pass: "123" },
        "STU02": { name: "Priya (Test)", pass: "123" },
        "STU03": { name: "Amit (Test)", pass: "123" }
    };
    localStorage.setItem('destiny_accounts', JSON.stringify(students));
}

let jitsiApi = null;
let currentRole = 'student'; 
const ADMIN_PASSWORD = "DESTINY-PRO-2026"; 

// --- STATUS LOGGER ---
function logStatus(msg, color = "#adb5bd") {
    const btn = document.getElementById('start-destiny-btn');
    btn.innerText = msg.toUpperCase();
    console.log(`[DESTINY] ${msg}`);
}

// --- ROLE SELECTION ---
document.getElementById('select-teacher-btn').onclick = function() {
    currentRole = 'teacher';
    this.classList.add('active');
    document.getElementById('select-student-btn').classList.remove('active');
    document.getElementById('teacher-login-box').classList.remove('hidden');
    document.getElementById('student-login-box').classList.add('hidden');
};

document.getElementById('select-student-btn').onclick = function() {
    currentRole = 'student';
    this.classList.add('active');
    document.getElementById('select-teacher-btn').classList.remove('active');
    document.getElementById('student-login-box').classList.remove('hidden');
    document.getElementById('teacher-login-box').classList.add('hidden');
};

// --- START ENGINE ---
document.getElementById('start-destiny-btn').onclick = async function() {
    if (currentRole === 'teacher') {
        if (document.getElementById('admin-pass-input').value !== ADMIN_PASSWORD) {
            return alert("INCORRECT ADMIN PASSWORD.");
        }
    } else {
        if (!document.getElementById('student-id-input').value || !document.getElementById('student-pass-input').value) {
            return alert("Enter Student ID and Password.");
        }
    }

    logStatus("Securing Media...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(t => t.stop());
    } catch (err) {
        return alert("Camera/Mic Permission Denied.");
    }

    const hashId = window.location.hash.substring(1);
    const roomId = hashId || 'ROOM-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    if (!hashId) window.location.hash = roomId;

    if (currentRole === 'teacher') {
        logStatus("Initializing Host...");
        initJitsi(roomId, "Teacher (Host)");
        initPeer(roomId);
    } else {
        logStatus("Locating Teacher...");
        initPeer(); // Random Student ID
        let attempts = 0;
        const linker = setInterval(() => {
            attempts++;
            if (peer && peer.open) {
                clearInterval(linker);
                tryConnect(roomId);
            }
            if (attempts > 20) {
                clearInterval(linker);
                logStatus("Teacher Offline");
                alert("The teacher hasn't started the session yet. Please wait for the teacher to go live.");
                window.location.reload();
            }
        }, 500);
    }
};

function initPeer(id) {
    if (peer) peer.destroy();
    peer = new Peer(id, { debug: 2 });
    peer.on('open', rid => {
        myIdDisplay.innerText = `ID: ${rid}`;
        peer.on('connection', conn => {
            dataPeers[conn.peer] = conn;
            conn.on('data', data => handleIncomingData(conn, data));
        });
    });
    peer.on('error', err => {
        console.error("Peer Error:", err.type);
        if (err.type === 'peer-unavailable') {
            logStatus("Teacher Offline");
        }
    });
}

function tryConnect(teacherId) {
    logStatus("Authenticating...");
    const conn = peer.connect(teacherId, { reliable: true });
    
    conn.on('open', () => {
        logStatus("Waiting in Lobby...");
        conn.send({ 
            type: 'knock', 
            id: document.getElementById('student-id-input').value, 
            pass: document.getElementById('student-pass-input').value 
        });
    });

    conn.on('data', data => {
        if (data.type === 'admit') {
            logStatus("Entry Granted");
            initJitsi(data.roomId, data.name);
        } else if (data.type === 'deny') {
            alert("Entry Denied: " + (data.reason || "Teacher declined"));
            window.location.reload();
        } else {
            handleDataSync(data);
        }
    });
}

function handleIncomingData(conn, data) {
    if (data.type === 'knock') {
        const student = students[data.id];
        if (student && student.pass === data.pass) {
            showLobbyModal(conn, student.name);
        } else {
            conn.send({ type: 'deny', reason: 'Invalid ID/Password' });
        }
    } else {
        handleDataSync(data);
    }
}

function showLobbyModal(conn, name) {
    document.getElementById('student-knock-name').innerText = name + " is knocking...";
    document.getElementById('security-modal').classList.remove('hidden');
    
    document.getElementById('admit-btn').onclick = () => {
        conn.send({ type: 'admit', roomId: window.location.hash.substring(1), name: name });
        document.getElementById('security-modal').classList.add('hidden');
    };
    
    document.getElementById('deny-btn').onclick = () => {
        conn.send({ type: 'deny', reason: 'Teacher declined' });
        document.getElementById('security-modal').classList.add('hidden');
    };
}

function initJitsi(id, name) {
    const domain = 'meet.jit.si';
    const options = {
        roomName: id,
        width: '100%',
        height: '100%',
        parentNode: document.getElementById('video-grid'),
        userInfo: { displayName: name },
        configOverwrite: { prejoinPageEnabled: false, disableDeepLinking: true },
        interfaceConfigOverwrite: { TOOLBAR_BUTTONS: [] }
    };
    jitsiApi = new JitsiMeetExternalAPI(domain, options);
    document.getElementById('launch-screen').style.display = 'none';
}

// --- BROADCAST & TOOLS ---
function broadcast(data) {
    Object.values(dataPeers).forEach(p => p.open && p.send(data));
}

function handleDataSync(data) {
    if (data.type === 'draw') draw(data.x, data.y, data.lx, data.ly, data.color, data.isE, false);
    if (data.type === 'clear') ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (data.type === 'notes') sharedNotes.value = data.text;
    if (data.type === 'chat') appendMsg('User', data.text);
}

// Whiteboard
canvas.addEventListener('mousedown', e => { isDrawing = true; [lx, ly] = [e.offsetX, e.offsetY]; });
canvas.addEventListener('mousemove', e => {
    if (!isDrawing) return;
    draw(e.offsetX, e.offsetY, lx, ly, document.getElementById('board-color').value, tool === 'eraser', true);
    [lx, ly] = [e.offsetX, e.offsetY];
});
canvas.addEventListener('mouseup', () => isDrawing = false);

function draw(x, y, l_x, l_y, color, isE, emit) {
    ctx.beginPath();
    ctx.lineWidth = isE ? 40 : 4;
    ctx.globalCompositeOperation = isE ? "destination-out" : "source-over";
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    ctx.moveTo(l_x, l_y); ctx.lineTo(x, y); ctx.stroke();
    if (emit) broadcast({ type: 'draw', x, y, lx: l_x, ly: l_y, color, isE });
}

document.getElementById('tool-pen').onclick = () => tool = 'pen';
document.getElementById('tool-eraser').onclick = () => tool = 'eraser';
document.getElementById('clear-board').onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); broadcast({ type: 'clear' }); };

document.getElementById('sidebar-btn').onclick = () => document.getElementById('sidebar').classList.toggle('hidden');
document.getElementById('board-btn').onclick = () => {
    const h = document.getElementById('whiteboard-container').classList.toggle('hidden');
    if (!h) { canvas.width = canvas.parentElement.offsetWidth; canvas.height = canvas.parentElement.offsetHeight; ctx.lineCap = 'round'; }
};

document.getElementById('mic-btn').onclick = () => jitsiApi && jitsiApi.executeCommand('toggleAudio');
document.getElementById('cam-btn').onclick = () => jitsiApi && jitsiApi.executeCommand('toggleVideo');
document.getElementById('share-btn').onclick = () => jitsiApi && jitsiApi.executeCommand('toggleShareScreen');
document.getElementById('end-btn').onclick = () => confirm("End Session?") && window.location.reload();

document.getElementById('copy-id-btn').onclick = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Professional Invite Link Copied!');
};

// Admin Logic
document.getElementById('gen-student-code').onclick = () => {
    const name = document.getElementById('new-student-name').value;
    const id = document.getElementById('new-student-id').value;
    const pass = document.getElementById('new-student-pass').value;
    if (!name || !id || !pass) return alert("Fill all fields");
    students[id] = { name, pass };
    localStorage.setItem('destiny_accounts', JSON.stringify(students));
    renderStudents();
    alert("Account Created!");
};

function renderStudents() {
    const list = document.getElementById('student-list');
    list.innerHTML = '';
    for (let id in students) {
        const div = document.createElement('div');
        div.className = 'student-item';
        div.innerHTML = `<span>${students[id].name} (ID: ${id})</span><button onclick="deleteStu('${id}')">Del</button>`;
        list.appendChild(div);
    }
}
window.deleteStu = (id) => { delete students[id]; localStorage.setItem('destiny_accounts', JSON.stringify(students)); renderStudents(); };

window.onload = () => {
    renderStudents();
    if (window.location.hash) {
        document.getElementById('select-student-btn').click();
    }
};

document.querySelectorAll('.nav-btn').forEach(b => {
    b.onclick = () => {
        document.querySelectorAll('.nav-btn, .tab-pane').forEach(el => el.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(`${b.dataset.tab}-tab`).classList.add('active');
    };
});

document.getElementById('send-chat').onclick = () => {
    const t = chatInput.value; if (!t) return;
    appendMsg('You', t); broadcast({ type: 'chat', text: t }); chatInput.value = '';
};

function appendMsg(s, t) {
    const m = document.createElement('div'); m.className = 'chat-msg';
    m.innerHTML = `<span class="sender">${s}:</span><span class="text">${t}</span>`;
    chatMessages.appendChild(m); chatMessages.scrollTop = chatMessages.scrollHeight;
}
