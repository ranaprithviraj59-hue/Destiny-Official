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

// Add default test accounts if none exist
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
let pendingStudents = {};
let myStudentName = "";

const ADMIN_PASSWORD = "DESTINY-PRO-2026"; 

// --- ROLE SELECTION ---
document.getElementById('select-teacher-btn').onclick = function() {
    currentRole = 'teacher';
    this.style.border = '1px solid #4dabf7';
    document.getElementById('select-student-btn').style.border = '1px solid #333';
    document.getElementById('teacher-login-box').classList.remove('hidden');
    document.getElementById('student-login-box').classList.add('hidden');
};

document.getElementById('select-student-btn').onclick = function() {
    currentRole = 'student';
    this.style.border = '1px solid #4dabf7';
    document.getElementById('select-teacher-btn').style.border = '1px solid #333';
    document.getElementById('student-login-box').classList.remove('hidden');
    document.getElementById('teacher-login-box').classList.add('hidden');
};

// --- THE UNSTOPPABLE START ---
document.getElementById('start-destiny-btn').onclick = async function() {
    if (currentRole === 'teacher') {
        if (document.getElementById('admin-pass-input').value !== ADMIN_PASSWORD) {
            return alert("INCORRECT ADMIN PASSWORD.");
        }
    } else {
        if (!document.getElementById('student-id-input').value || !document.getElementById('student-pass-input').value) {
            return alert("Enter your Student ID and Password.");
        }
    }

    this.innerText = "OPENING DESTINY...";
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        alert("CRITICAL: Camera/Mic permission required.");
        return;
    }

    const hashId = window.location.hash.substring(1);
    const roomId = hashId || 'DESTINY-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    if (!hashId) window.location.hash = roomId;

    if (currentRole === 'teacher') {
        startJitsi(roomId, "Teacher (Host)");
        startPeer(roomId);
    } else {
        this.innerText = "AUTHENTICATING...";
        startPeer(); // Random ID for student
        setTimeout(() => connectToTeacher(roomId), 1000);
    }
};

function startJitsi(id, name) {
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

function startPeer(id) {
    peer = new Peer(id);
    peer.on('open', rid => {
        myIdDisplay.innerText = `Room ID: ${rid}`;
        setupPeerListeners();
    });
}

function setupPeerListeners() {
    peer.on('connection', conn => {
        dataPeers[conn.peer] = conn;
        conn.on('data', data => {
            if (data.type === 'knock') {
                const isValid = students[data.id] && students[data.id].pass === data.pass;
                if (!isValid) {
                    conn.send({ type: 'deny', reason: 'Invalid Credentials' });
                } else {
                    handleKnock(conn.peer, students[data.id].name);
                }
            }
            handleData(data);
        });
    });
}

function handleKnock(id, name) {
    pendingStudents[id] = { name };
    document.getElementById('student-knock-name').innerText = name + " is knocking...";
    document.getElementById('security-modal').classList.remove('hidden');
    
    document.getElementById('admit-btn').onclick = () => {
        dataPeers[id].send({ type: 'admit', roomId: window.location.hash.substring(1), name: name });
        document.getElementById('security-modal').classList.add('hidden');
    };
    
    document.getElementById('deny-btn').onclick = () => {
        dataPeers[id].send({ type: 'deny', reason: 'Teacher declined entry' });
        document.getElementById('security-modal').classList.add('hidden');
    };
}

function connectToTeacher(id) {
    const sId = document.getElementById('student-id-input').value;
    const sPass = document.getElementById('student-pass-input').value;
    const conn = peer.connect(id);
    dataPeers[id] = conn;
    conn.on('open', () => {
        conn.send({ type: 'knock', id: sId, pass: sPass });
    });
    conn.on('data', data => {
        if (data.type === 'admit') {
            startJitsi(data.roomId, data.name);
        } else if (data.type === 'deny') {
            alert("ACCESS DENIED: " + data.reason);
            window.location.reload();
        } else {
            handleData(data);
        }
    });
}

// --- ADMIN PANEL LOGIC ---
document.getElementById('gen-student-code').onclick = () => {
    const name = document.getElementById('new-student-name').value;
    const id = document.getElementById('new-student-id').value;
    const pass = document.getElementById('new-student-pass').value;
    
    if (!name || !id || !pass) return alert("Fill all fields!");
    
    students[id] = { name, pass };
    localStorage.setItem('destiny_accounts', JSON.stringify(students));
    
    document.getElementById('new-student-name').value = '';
    document.getElementById('new-student-id').value = '';
    document.getElementById('new-student-pass').value = '';
    renderStudents();
    alert("Account Created for " + name);
};

function renderStudents() {
    const list = document.getElementById('student-list');
    list.innerHTML = '';
    for (let id in students) {
        const div = document.createElement('div');
        div.className = 'student-item';
        div.innerHTML = `
            <div class="student-info">
                <span class="s-name">${students[id].name}</span>
                <span class="s-code">ID: ${id} | Pass: ${students[id].pass}</span>
            </div>
            <div class="student-item-btns">
                <button class="btn-del" onclick="deleteStudent('${id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(div);
    }
}

window.deleteStudent = (id) => {
    delete students[id];
    localStorage.setItem('destiny_accounts', JSON.stringify(students));
    renderStudents();
};

window.onload = () => {
    renderStudents();
    const hashId = window.location.hash.substring(1);
    if (hashId) {
        document.getElementById('select-student-btn').click();
        document.getElementById('start-destiny-btn').innerText = "LOGIN & JOIN";
    }
};

// --- TOOLS & BROADCAST ---
function broadcast(data) {
    Object.values(dataPeers).forEach(p => p.open && p.send(data));
}

function handleData(data) {
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
document.getElementById('end-btn').onclick = () => confirm("End session?") && window.location.reload();

document.getElementById('copy-id-btn').onclick = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Link Copied!');
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
    m.innerHTML = `<span class="sender">${s}</span><span class="text">${t}</span>`;
    chatMessages.appendChild(m); chatMessages.scrollTop = chatMessages.scrollHeight;
}
