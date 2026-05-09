const videoGrid = document.getElementById('video-grid');
const myIdDisplay = document.getElementById('my-id-display');
const sharedNotes = document.getElementById('shared-notes');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

let peer = null, dataPeers = {}, calls = {};
let isDrawing = false, lx = 0, ly = 0, tool = 'pen';
let students = JSON.parse(localStorage.getItem('destiny_students') || '{}');
let jitsiApi = null;
let currentRole = 'student'; 
let pendingStudents = {};

const ADMIN_PASSWORD = "DESTINY-PRO-2026"; 

document.getElementById('select-teacher-btn').onclick = function() {
    currentRole = 'teacher';
    this.style.border = '1px solid #4dabf7';
    document.getElementById('select-student-btn').style.border = '1px solid #333';
    document.getElementById('admin-pass-input').classList.remove('hidden');
};

document.getElementById('select-student-btn').onclick = function() {
    currentRole = 'student';
    this.style.border = '1px solid #4dabf7';
    document.getElementById('select-teacher-btn').style.border = '1px solid #333';
    document.getElementById('admin-pass-input').classList.add('hidden');
};

document.getElementById('start-destiny-btn').onclick = async function() {
    if (currentRole === 'teacher') {
        const inputPass = document.getElementById('admin-pass-input').value;
        if (inputPass !== ADMIN_PASSWORD) {
            alert("INCORRECT ADMIN PASSWORD.");
            return;
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
        startJitsi(roomId);
        startPeer(roomId);
    } else {
        // Student waits for "Admit"
        this.innerText = "WAITING FOR TEACHER...";
        startPeer(); // Random ID for student
        setTimeout(() => connectToTeacher(roomId), 1000);
    }
};

function startJitsi(id) {
    const domain = 'meet.jit.si';
    const options = {
        roomName: id,
        width: '100%',
        height: '100%',
        parentNode: document.getElementById('video-grid'),
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
                handleKnock(conn.peer, data.name);
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
        dataPeers[id].send({ type: 'admit', roomId: window.location.hash.substring(1) });
        document.getElementById('security-modal').classList.add('hidden');
        delete pendingStudents[id];
    };
    
    document.getElementById('deny-btn').onclick = () => {
        dataPeers[id].send({ type: 'deny' });
        document.getElementById('security-modal').classList.add('hidden');
        delete pendingStudents[id];
    };
}

function connectToTeacher(id) {
    const name = prompt("Enter your name to join:") || "Guest Student";
    const conn = peer.connect(id);
    dataPeers[id] = conn;
    conn.on('open', () => {
        conn.send({ type: 'knock', name: name });
    });
    conn.on('data', data => {
        if (data.type === 'admit') {
            startJitsi(data.roomId);
        } else if (data.type === 'deny') {
            alert("The Teacher denied your entry.");
            window.location.reload();
        } else {
            handleData(data);
        }
    });
}

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
