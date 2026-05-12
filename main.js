const videoGrid = document.getElementById('video-grid');
const myIdDisplay = document.getElementById('my-id-display');
const sharedNotes = document.getElementById('shared-notes');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

let peer = null, dataPeers = {}, calls = {};
let isDrawing = false, lx = 0, ly = 0, tool = 'pen';

// --- ENGINE VERSION (Visible to user to verify update) ---
const VERSION = "DESTINY-PRO-V3.0";
console.log(`[SYSTEM] Starting ${VERSION}...`);

// --- 100% HARDCODED ACCOUNTS ---
const ACCOUNTS = {
    "STU01": { name: "Rahul", pass: "123" },
    "STU02": { name: "Priya", pass: "123" },
    "STU03": { name: "Amit", pass: "123" }
};

let customStudents = JSON.parse(localStorage.getItem('destiny_accounts') || '{}');
let jitsiApi = null;
let currentRole = 'student'; 
const ADMIN_PASSWORD = "DESTINY-PRO-2026"; 

// Update UI Version
window.onload = () => {
    const statusText = document.getElementById('status-text');
    if(statusText) statusText.innerText = VERSION + " | SECURE";
    renderStudents();
    if (window.location.hash) document.getElementById('select-student-btn').click();
};

function logStatus(msg) {
    const btn = document.getElementById('start-destiny-btn');
    if (btn) btn.innerText = msg.toUpperCase();
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
        const pass = document.getElementById('admin-pass-input').value.trim();
        if (pass !== ADMIN_PASSWORD) return alert("WRONG ADMIN PASSWORD!");
    } else {
        const sid = document.getElementById('student-id-input').value.trim();
        const spass = document.getElementById('student-pass-input').value.trim();
        if (!sid || !spass) return alert("ENTER YOUR ID & PASSWORD!");
    }

    logStatus("Requesting Camera...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(t => t.stop());
    } catch (err) {
        console.warn("Camera blocked");
    }

    const roomId = window.location.hash.substring(1) || 'DESTINY-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    if (!window.location.hash) window.location.hash = roomId;

    if (currentRole === 'teacher') {
        logStatus("Hosting Classroom...");
        initJitsi(roomId, "Teacher (Host)");
        initPeer(roomId);
    } else {
        logStatus("Searching for Host...");
        initPeer(); 
        let attempts = 0;
        const searcher = setInterval(() => {
            attempts++;
            if (peer && peer.open) {
                clearInterval(searcher);
                knockOnDoor(roomId);
            }
            if (attempts > 50) {
                clearInterval(searcher);
                logStatus("Teacher Not Found");
                alert("HOST IS OFFLINE. The teacher must start the classroom first!");
                window.location.reload();
            }
        }, 500);
    }
};

function initPeer(id) {
    if (peer) peer.destroy();
    peer = new Peer(id);
    peer.on('open', rid => {
        myIdDisplay.innerText = `ROOM: ${rid}`;
        peer.on('connection', conn => {
            dataPeers[conn.peer] = conn;
            conn.on('data', data => {
                if (data.type === 'knock') {
                    const studentId = data.id.trim().toUpperCase();
                    const match = ACCOUNTS[studentId] || customStudents[studentId];
                    if (match && match.pass === data.pass) {
                        showLobby(conn, match.name);
                    } else {
                        conn.send({ type: 'deny', reason: "Account Not Found" });
                    }
                } else {
                    handleDataSync(data);
                }
            });
        });
    });
}

function knockOnDoor(hostId) {
    logStatus("Authenticating...");
    const conn = peer.connect(hostId);
    
    conn.on('open', () => {
        logStatus("In Lobby...");
        conn.send({ 
            type: 'knock', 
            id: document.getElementById('student-id-input').value, 
            pass: document.getElementById('student-pass-input').value 
        });
    });

    conn.on('data', data => {
        if (data.type === 'admit') {
            logStatus("Welcome!");
            initJitsi(data.roomId, data.name);
        } else if (data.type === 'deny') {
            alert("ENTRY DENIED: " + data.reason);
            window.location.reload();
        } else {
            handleDataSync(data);
        }
    });
}

function showLobby(conn, name) {
    document.getElementById('student-knock-name').innerText = name + " is waiting...";
    document.getElementById('security-modal').classList.remove('hidden');
    
    document.getElementById('admit-btn').onclick = () => {
        conn.send({ type: 'admit', roomId: window.location.hash.substring(1), name: name });
        document.getElementById('security-modal').classList.add('hidden');
    };
    
    document.getElementById('deny-btn').onclick = () => {
        conn.send({ type: 'deny', reason: "Host declined entry" });
        document.getElementById('security-modal').classList.add('hidden');
    };
}

function initJitsi(id, name) {
    const domain = 'meet.jit.si';
    const options = {
        roomName: id,
        width: '100%', height: '100%',
        parentNode: document.getElementById('video-grid'),
        userInfo: { displayName: name },
        configOverwrite: { 
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            skipPrejoinButton: true,
            enableWelcomePage: false,
            disableDeepLinking: true,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            requireDisplayName: false,
            hideDisplayName: false
        },
        interfaceConfigOverwrite: { 
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'desktop', 'fullscreen', 'hangup', 'chat', 'settings', 'raisehand', 'videoquality', 'tileview'
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_PROMOTIONAL_CLOSE_PAGE: false,
            RECENT_LIST_ENABLED: false,
            GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false
        }
    };
    jitsiApi = new JitsiMeetExternalAPI(domain, options);
    document.getElementById('launch-screen').style.display = 'none';
}

// --- TOOLS SYNC ---
function broadcast(data) {
    Object.values(dataPeers).forEach(p => p.open && p.send(data));
}

function handleDataSync(data) {
    if (data.type === 'draw') draw(data.x, data.y, data.lx, data.ly, data.color, data.isE, false);
    if (data.type === 'clear') ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (data.type === 'notes') sharedNotes.value = data.text;
    if (data.type === 'chat') appendMsg('Partner', data.text);
}

// Canvas
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
document.getElementById('end-btn').onclick = () => confirm("End Classroom Session?") && window.location.reload();

document.getElementById('copy-id-btn').onclick = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('PROFESSIONAL INVITE LINK COPIED!');
};

document.getElementById('gen-student-code').onclick = () => {
    const name = document.getElementById('new-student-name').value;
    const id = document.getElementById('new-student-id').value.toUpperCase().trim();
    const pass = document.getElementById('new-student-pass').value.trim();
    if (!name || !id || !pass) return alert("FILL ALL FIELDS!");
    customStudents[id] = { name, pass };
    localStorage.setItem('destiny_accounts', JSON.stringify(customStudents));
    renderStudents();
    alert("ACCOUNT CREATED!");
};

function renderStudents() {
    const list = document.getElementById('student-list');
    if(!list) return;
    list.innerHTML = '';
    for (let id in ACCOUNTS) {
        const div = document.createElement('div'); div.className = 'student-item';
        div.innerHTML = `<span style="color:#4dabf7;">${ACCOUNTS[id].name} (ID: ${id})</span>`;
        list.appendChild(div);
    }
    for (let id in customStudents) {
        const div = document.createElement('div'); div.className = 'student-item';
        div.innerHTML = `<span>${customStudents[id].name} (ID: ${id})</span><button onclick="deleteStu('${id}')">DEL</button>`;
        list.appendChild(div);
    }
}
window.deleteStu = (id) => { delete customStudents[id]; localStorage.setItem('destiny_accounts', JSON.stringify(customStudents)); renderStudents(); };

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
