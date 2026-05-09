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

    this.innerText = "SECURING SESSION...";
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        alert("CRITICAL: Camera/Mic permission required.");
        this.innerText = "LAUNCH CLASSROOM";
        return;
    }

    const hashId = window.location.hash.substring(1);
    const roomId = hashId || 'DESTINY-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    if (!hashId) window.location.hash = roomId;

    try {
        const domain = 'meet.jit.si';
        const options = {
            roomName: roomId,
            width: '100%',
            height: '100%',
            parentNode: document.getElementById('video-grid'),
            configOverwrite: { 
                prejoinPageEnabled: false, 
                disableDeepLinking: true,
                remoteVideoMenu: { disableKick: (currentRole === 'student') },
                enableLobbyChat: false
            },
            interfaceConfigOverwrite: { TOOLBAR_BUTTONS: [], SHOW_PROMOTIONAL_CLOSE_PAGE: false }
        };
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
        document.getElementById('launch-screen').style.display = 'none';
        
        if (currentRole === 'student') {
            document.getElementById('admin-tab-trigger').classList.add('hidden');
            document.getElementById('copy-id-btn').style.display = 'none';
            // Listen for teacher commands
            jitsiApi.addEventListener('endpointTextMessageReceived', (event) => {
                const data = JSON.parse(event.data.text);
                if (data.type === 'mute-force') jitsiApi.executeCommand('muteEveryone');
            });
        }

    } catch (e) { alert("Video Engine Error."); return; }

    peer = new Peer(currentRole === 'teacher' ? roomId : undefined);
    peer.on('open', id => {
        myIdDisplay.innerText = `Room ID: ${id}`;
        if (currentRole === 'student') connectToClass(roomId);
        renderStudents();
    });
    setupPeerListeners();
};

window.onload = () => {
    const hashId = window.location.hash.substring(1);
    if (hashId) {
        document.getElementById('select-student-btn').click();
        document.getElementById('start-destiny-btn').innerText = "JOIN CLASSROOM";
    }
};

function setupPeerListeners() {
    peer.on('connection', conn => {
        dataPeers[conn.peer] = conn;
        conn.on('data', data => handleData(data));
        conn.on('open', () => {
            if (currentRole === 'teacher') conn.send({ type: 'notes', text: sharedNotes.value });
        });
    });
}

// --- TEACHER MODERATION ---
document.getElementById('mute-all-btn').onclick = () => {
    if (currentRole !== 'teacher' || !jitsiApi) return;
    jitsiApi.executeCommand('muteEveryone');
    broadcast({ type: 'force-mute-ui' }); // Sync UI if needed
    alert("All students muted.");
};

document.getElementById('gen-student-code').onclick = () => {
    const name = document.getElementById('new-student-name').value;
    if (!name) return alert("Enter Student Name");
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const id = "STU-" + Math.random().toString(36).substr(2, 4).toUpperCase();
    students[id] = { name, code };
    localStorage.setItem('destiny_students', JSON.stringify(students));
    document.getElementById('new-student-name').value = '';
    renderStudents();
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
                <button class="btn-copy-mini" onclick="copyInvite('${students[id].code}')"><i class="fas fa-copy"></i></button>
                <button class="btn-del" onclick="deleteStudent('${id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(div);
    }
}

window.copyInvite = (code) => {
    const url = window.location.href;
    navigator.clipboard.writeText(`Join my DESTINY Classroom!\nLink: ${url}\nAccess Code: ${code}`);
    alert('Invite Copied!');
};

window.deleteStudent = (id) => {
    delete students[id];
    localStorage.setItem('destiny_students', JSON.stringify(students));
    renderStudents();
};

function connectToClass(id) {
    const conn = peer.connect(id);
    dataPeers[id] = conn;
    conn.on('data', data => handleData(data));
}

document.getElementById('call-btn').onclick = () => {
    const id = document.getElementById('remote-id-input').value;
    if (id) connectToClass(id);
};

function broadcast(data) { 
    Object.values(dataPeers).forEach(p => p.open && p.send(data));
}

sharedNotes.addEventListener('input', () => {
    broadcast({ type: 'notes', text: sharedNotes.value });
});

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
    if (confirm("End session?")) {
        if(jitsiApi) jitsiApi.dispose();
        window.location.reload();
    }
};

document.getElementById('copy-id-btn').onclick = () => {
    const url = window.location.href; 
    navigator.clipboard.writeText(url);
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
