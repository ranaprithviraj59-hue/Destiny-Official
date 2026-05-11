const videoGrid = document.getElementById('video-grid');
const myIdDisplay = document.getElementById('my-id-display');
const sharedNotes = document.getElementById('shared-notes');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

let peer = null, dataPeers = {}, calls = {};
let isDrawing = false, lx = 0, ly = 0, tool = 'pen';

// --- THE TRULY GLOBAL ACCOUNTS ---
const GLOBAL_ACCOUNTS = {
    "STU01": { name: "Rahul", pass: "123" },
    "STU02": { name: "Priya", pass: "123" },
    "STU03": { name: "Amit", pass: "123" }
};

let customStudents = JSON.parse(localStorage.getItem('destiny_accounts') || '{}');
let jitsiApi = null;
let currentRole = 'student'; 
const ADMIN_PASSWORD = "DESTINY-PRO-2026"; 

function logStatus(msg) {
    document.getElementById('start-destiny-btn').innerText = msg.toUpperCase();
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
        const sid = document.getElementById('student-id-input').value.trim();
        const spass = document.getElementById('student-pass-input').value.trim();
        if (!sid || !spass) return alert("Please enter Student ID and Password.");
    }

    logStatus("Securing Media...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(t => t.stop());
    } catch (err) {
        alert("Camera/Mic Permission Denied. The app will continue but video/audio won't work.");
    }

    const hashId = window.location.hash.substring(1);
    const roomId = hashId || 'DESTINY-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    if (!hashId) window.location.hash = roomId;

    if (currentRole === 'teacher') {
        logStatus("Starting Host...");
        initJitsi(roomId, "Teacher (Host)");
        initPeer(roomId);
    } else {
        logStatus("Connecting...");
        initPeer(); 
        let attempts = 0;
        const linker = setInterval(() => {
            attempts++;
            if (peer && peer.open) {
                clearInterval(linker);
                tryConnectToHost(roomId);
            }
            if (attempts > 40) {
                clearInterval(linker);
                logStatus("Teacher Offline");
                alert("Teacher is not online yet. Please wait for the host to start.");
                window.location.reload();
            }
        }, 500);
    }
};

function initPeer(id) {
    if (peer) peer.destroy();
    peer = new Peer(id, { debug: 1 });
    peer.on('open', rid => {
        myIdDisplay.innerText = `ID: ${rid}`;
        peer.on('connection', conn => {
            dataPeers[conn.peer] = conn;
            conn.on('data', data => handleIncomingData(conn, data));
        });
    });
}

function tryConnectToHost(hostId) {
    logStatus("Authenticating...");
    const conn = peer.connect(hostId, { reliable: true });
    
    conn.on('open', () => {
        logStatus("Waiting in Lobby...");
        conn.send({ 
            type: 'knock', 
            id: document.getElementById('student-id-input').value.trim(), 
            pass: document.getElementById('student-pass-input').value.trim() 
        });
    });

    conn.on('data', data => {
        if (data.type === 'admit') {
            logStatus("Access Granted");
            initJitsi(data.roomId, data.name);
        } else if (data.type === 'deny') {
            alert("ACCESS DENIED: " + (data.reason || "Teacher declined entry"));
            window.location.reload();
        } else {
            handleDataSync(data);
        }
    });
}

function handleIncomingData(conn, data) {
    if (data.type === 'knock') {
        const sId = data.id.toUpperCase();
        // Check Global + Custom accounts
        const student = GLOBAL_ACCOUNTS[sId] || customStudents[sId];
        
        if (student && student.pass === data.pass) {
            console.log(`[HOST] Match found for student: ${student.name}`);
            showLobbyModal(conn, student.name);
        } else {
            console.log(`[HOST] Login Failed for ID: ${sId}`);
            conn.send({ type: 'deny', reason: 'Invalid ID or Password' });
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
        conn.send({ type: 'deny', reason: 'Teacher declined entry' });
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
            requireDisplayName: false
        },
        interfaceConfigOverwrite: { 
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
                'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
                'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
                'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
                'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone',
                'security'
            ],
            SHOW_PROMOTIONAL_CLOSE_PAGE: false,
            SHOW_JITSI_WATERMARK: false,
            RECENT_LIST_ENABLED: false
        }
    };
    jitsiApi = new JitsiMeetExternalAPI(domain, options);
    document.getElementById('launch-screen').style.display = 'none';
}

function broadcast(data) {
    Object.values(dataPeers).forEach(p => p.open && p.send(data));
}

function handleDataSync(data) {
    if (data.type === 'draw') draw(data.x, data.y, data.lx, data.ly, data.color, data.isE, false);
    if (data.type === 'clear') ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (data.type === 'notes') sharedNotes.value = data.text;
    if (data.type === 'chat') appendMsg('Partner', data.text);
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
    alert('Invite Link Copied!');
};

document.getElementById('gen-student-code').onclick = () => {
    const name = document.getElementById('new-student-name').value;
    const id = document.getElementById('new-student-id').value.toUpperCase();
    const pass = document.getElementById('new-student-pass').value;
    if (!name || !id || !pass) return alert("Fill all fields");
    customStudents[id] = { name, pass };
    localStorage.setItem('destiny_accounts', JSON.stringify(customStudents));
    renderStudents();
    alert("Account Created!");
};

function renderStudents() {
    const list = document.getElementById('student-list');
    list.innerHTML = '';
    for (let id in GLOBAL_ACCOUNTS) {
        const div = document.createElement('div'); div.className = 'student-item';
        div.innerHTML = `<span style="color:#4dabf7;">${GLOBAL_ACCOUNTS[id].name} (Global)</span>`;
        list.appendChild(div);
    }
    for (let id in customStudents) {
        const div = document.createElement('div'); div.className = 'student-item';
        div.innerHTML = `<span>${customStudents[id].name} (ID: ${id})</span><button onclick="deleteStu('${id}')">Del</button>`;
        list.appendChild(div);
    }
}
window.deleteStu = (id) => { delete customStudents[id]; localStorage.setItem('destiny_accounts', JSON.stringify(customStudents)); renderStudents(); };

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
