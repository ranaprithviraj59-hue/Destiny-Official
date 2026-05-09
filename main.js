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

// --- THE UNSTOPPABLE START ---
document.getElementById('start-destiny-btn').onclick = async function() {
    this.innerText = "SECURING SESSION...";
    
    // 1. Force Camera/Mic Permission Check
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        console.error("Media error:", err);
        alert("CRITICAL: Camera/Mic permission is required. Please allow access in your browser.");
        this.innerText = "LAUNCH CLASSROOM";
        return;
    }

    const roomId = 'DESTINY-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    
    // 2. Initialize Jitsi IMMEDIATELY
    try {
        const domain = 'meet.jit.si';
        const options = {
            roomName: roomId,
            width: '100%',
            height: '100%',
            parentNode: document.getElementById('video-grid'),
            configOverwrite: {
                startWithAudioMuted: false,
                disableDeepLinking: true,
                prejoinPageEnabled: false,
                enableWelcomePage: false
            },
            interfaceConfigOverwrite: {
                TOOLBAR_BUTTONS: [],
                SETTINGS_SECTIONS: [],
                VIDEO_LAYOUT_FIT: 'both',
                SHOW_JITSI_WATERMARK: false
            }
        };
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
        
        // Hide launch screen once Jitsi starts loading
        document.getElementById('launch-screen').style.display = 'none';
        document.getElementById('status-text').innerText = "Live & Secure";
        
    } catch (jitsiErr) {
        console.error("Jitsi Load Error:", jitsiErr);
        alert("Failed to load Video Engine. Please check your internet.");
        this.innerText = "LAUNCH CLASSROOM";
        return;
    }

    // 3. Start Networking for Tools (Background)
    peer = new Peer(roomId);
    peer.on('open', id => {
        myIdDisplay.innerText = `Room ID: ${id}`;
        renderStudents();
    });
    peer.on('error', err => console.warn("PeerJS Background Error:", err));

    setupPeerListeners();
};

function setupPeerListeners() {
    peer.on('connection', conn => {
        dataPeers[conn.peer] = conn;
        conn.on('data', data => handleData(data));
        conn.on('open', () => {
            conn.send({ type: 'notes', text: sharedNotes.value });
        });
    });
}

// --- ADMIN PANEL LOGIC ---
document.getElementById('gen-student-code').onclick = () => {
    const name = document.getElementById('new-student-name').value;
    if (!name) return alert("Enter Student Name");
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const id = "STU-" + Math.random().toString(36).substr(2, 4).toUpperCase();
    students[id] = { name, code };
    localStorage.setItem('destiny_students', JSON.stringify(students));
    document.getElementById('new-student-name').value = '';
    renderStudents();
    alert(`Invite Generated for ${name}!\nCode: ${code}`);
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
                <span class="s-code">Code: ${students[id].code}</span>
            </div>
            <div class="student-item-btns">
                <button class="btn-copy-mini" onclick="copyInvite('${students[id].code}')" title="Copy Access Code"><i class="fas fa-copy"></i></button>
                <button class="btn-del" onclick="deleteStudent('${id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(div);
    }
}

window.copyInvite = (code) => {
    const id = myIdDisplay.innerText.replace('Room ID: ', '');
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    navigator.clipboard.writeText(`Join my DESTINY Classroom!\nLink: ${url}\nAccess Code: ${code}`);
    alert('Full Invite Copied to Clipboard!');
};

window.deleteStudent = (id) => {
    delete students[id];
    localStorage.setItem('destiny_students', JSON.stringify(students));
    renderStudents();
};

// --- CONNECTIVITY (For Tools Sync & Video Join) ---
function connectToClass(id) {
    // 1. Join Jitsi Room
    if (!jitsiApi) {
        const domain = 'meet.jit.si';
        const options = {
            roomName: id,
            width: '100%',
            height: '100%',
            parentNode: document.getElementById('video-grid'),
            configOverwrite: { prejoinPageEnabled: false },
            interfaceConfigOverwrite: { TOOLBAR_BUTTONS: [] }
        };
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
        document.getElementById('launch-screen').style.display = 'none';
        document.getElementById('status-text').innerText = "Joined Class";
        document.getElementById('status-dot').style.background = "#40c057";
    }

    // 2. Connect PeerJS for Tools Sync
    if (!peer) peer = new Peer(); // Students use random ID to connect to teacher
    
    peer.on('open', () => {
        const conn = peer.connect(id);
        dataPeers[id] = conn;
        conn.on('data', data => handleData(data));
        conn.on('open', () => {
            appendMsg('System', 'Connected to Teacher for Tools Sync.');
        });
    });
}

document.getElementById('call-btn').onclick = () => {
    const id = document.getElementById('remote-id-input').value;
    if (id) connectToClass(id);
};

// --- TOOLS LOGIC ---
function broadcast(data) { Object.values(dataPeers).forEach(p => p.open && p.send(data)); }

sharedNotes.addEventListener('input', () => {
    broadcast({ type: 'notes', text: sharedNotes.value });
});

function handleData(data) {
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

// Sidebar & Buttons
document.getElementById('sidebar-btn').onclick = () => document.getElementById('sidebar').classList.toggle('hidden');
document.getElementById('board-btn').onclick = () => {
    const h = document.getElementById('whiteboard-container').classList.toggle('hidden');
    if (!h) { canvas.width = canvas.parentElement.offsetWidth; canvas.height = canvas.parentElement.offsetHeight; ctx.lineCap = 'round'; }
};

document.getElementById('mic-btn').onclick = function() {
    if(!jitsiApi) return;
    jitsiApi.executeCommand('toggleAudio');
    this.classList.toggle('active');
};

document.getElementById('cam-btn').onclick = function() {
    if(!jitsiApi) return;
    jitsiApi.executeCommand('toggleVideo');
    this.classList.toggle('active');
};

document.getElementById('share-btn').onclick = function() {
    if(!jitsiApi) return;
    jitsiApi.executeCommand('toggleShareScreen');
};

document.getElementById('end-btn').onclick = () => {
    if (confirm("End this classroom session?")) {
        if(jitsiApi) jitsiApi.dispose();
        window.location.reload();
    }
};

document.getElementById('copy-id-btn').onclick = () => {
    const id = myIdDisplay.innerText.replace('Room ID: ', '');
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${id}`);
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
