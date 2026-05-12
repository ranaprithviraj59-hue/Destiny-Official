const videoGrid = document.getElementById('video-grid');
const myIdDisplay = document.getElementById('my-id-display');
const sharedNotes = document.getElementById('shared-notes');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

let peer = null, dataPeers = {}, calls = {};
let isDrawing = false, lx = 0, ly = 0, tool = 'pen';

// --- ULTIMATE VERSION 5.0 ---
const VERSION = "ULTIMATE-V5.0";
console.log(`%c[DESTINY] %cStarting ${VERSION}`, "color: #4dabf7; font-weight: bold; font-size: 20px;", "color: white;");

// --- FAIL-PROOF ACCOUNTS ---
const ACCOUNTS = {
    "STU01": { name: "Rahul (Test)", pass: "123" },
    "STU02": { name: "Priya (Test)", pass: "123" },
    "STU03": { name: "Amit (Test)", pass: "123" }
};

let customStudents = JSON.parse(localStorage.getItem('destiny_accounts') || '{}');
let jitsiApi = null;
let currentRole = 'student'; 
const ADMIN_PASSWORD = "DESTINY-PRO-2026"; 

// Update UI Version
window.onload = () => {
    const statusText = document.getElementById('status-text');
    if(statusText) statusText.innerHTML = `<span style="color:#ff6b6b; font-weight:bold;">${VERSION}</span> | SECURE`;
    renderStudents();
    if (window.location.hash) {
        document.getElementById('select-student-btn').click();
        document.getElementById('start-destiny-btn').innerText = "V5: LOGIN & JOIN";
    }
};

function setStatus(msg) {
    const btn = document.getElementById('start-destiny-btn');
    if (btn) btn.innerText = `[${VERSION}] ` + msg.toUpperCase();
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
        if (!sid || !spass) return alert("ENTER ID & PASSWORD!");
    }

    setStatus("Checking Media...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(t => t.stop());
    } catch (err) { console.warn("Camera blocked"); }

    const roomId = window.location.hash.substring(1) || 'ROOM-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    if (!window.location.hash) window.location.hash = roomId;

    if (currentRole === 'teacher') {
        setStatus("Starting Host...");
        initJitsi(roomId, "Teacher (Host)");
        initPeer(roomId);
    } else {
        setStatus("Locating Host...");
        initPeer(); 
        let attempts = 0;
        const linker = setInterval(() => {
            attempts++;
            if (peer && peer.open) {
                clearInterval(linker);
                knockOnHost(roomId);
            }
            if (attempts > 60) {
                clearInterval(linker);
                setStatus("Host Offline");
                alert("TEACHER IS OFFLINE. The Host must enter the room first!");
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
            conn.on('data', data => handleHandshake(conn, data));
        });
    });
}

function knockOnHost(hostId) {
    setStatus("Authenticating...");
    const conn = peer.connect(hostId, { reliable: true });
    
    conn.on('open', () => {
        setStatus("In Lobby...");
        const sid = document.getElementById('student-id-input').value.trim().toUpperCase();
        const spass = document.getElementById('student-pass-input').value.trim();
        conn.send({ type: 'knock-v5', id: sid, pass: spass });
    });

    conn.on('data', data => {
        if (data.type === 'admit') {
            setStatus("Entry Granted!");
            initJitsi(data.roomId, data.name);
        } else if (data.type === 'deny') {
            alert("ACCESS DENIED: " + data.reason);
            window.location.reload();
        } else {
            handleSync(data);
        }
    });
}

function handleHandshake(conn, data) {
    if (data.type === 'knock-v5') {
        const studentId = data.id.toUpperCase().trim();
        const studentPass = data.pass.trim();
        
        console.log(`[V5-DEBUG] Received Knock: ID=${studentId}, Pass=${studentPass}`);
        
        const account = ACCOUNTS[studentId] || customStudents[studentId];
        
        if (account && account.pass.trim() === studentPass) {
            console.log(`[V5-SUCCESS] Matched: ${account.name}`);
            showLobbyModal(conn, account.name);
        } else {
            console.error(`[V5-FAIL] No Match for ${studentId}`);
            conn.send({ type: 'deny', reason: 'Invalid Credentials (V5)' });
        }
    } else {
        handleSync(data);
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
            requireDisplayName: false,
            hideDisplayName: true
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
    
    // Hard-Force bypass after join
    jitsiApi.addEventListener('videoConferenceJoined', () => {
        console.log("[V5] Jitsi Joined Successfully.");
        jitsiApi.executeCommand('toggleAudio'); 
        jitsiApi.executeCommand('toggleAudio'); // Toggle twice to force state
    });
}

// --- TOOLS & BROADCAST ---
function broadcast(data) {
    Object.values(dataPeers).forEach(p => p.open && p.send(data));
}

function handleSync(data) {
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
    if (!h) { 
        canvas.width = canvas.parentElement.offsetWidth; 
        canvas.height = canvas.parentElement.offsetHeight; 
        ctx.lineCap = 'round'; 
    }
};

document.getElementById('mic-btn').onclick = () => jitsiApi && jitsiApi.executeCommand('toggleAudio');
document.getElementById('cam-btn').onclick = () => jitsiApi && jitsiApi.executeCommand('toggleVideo');
document.getElementById('share-btn').onclick = () => jitsiApi && jitsiApi.executeCommand('toggleShareScreen');
document.getElementById('end-btn').onclick = () => confirm("End Classroom?") && window.location.reload();

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
