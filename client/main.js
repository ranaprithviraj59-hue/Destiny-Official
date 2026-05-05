const localVideo = document.getElementById('local-video');
const videoGrid = document.getElementById('video-grid');
const myIdDisplay = document.getElementById('my-id-display');
const sharedNotes = document.getElementById('shared-notes');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');

let localStream = null, peer = null, dataPeers = {}, calls = {};
let isDrawing = false, lx = 0, ly = 0, tool = 'pen';
let students = JSON.parse(localStorage.getItem('destiny_students') || '{}');

// --- THE UNSTOPPABLE START ---
document.getElementById('start-destiny-btn').onclick = async function() {
    this.innerText = "OPENING DESTINY...";
    
    // 1. Try to get Camera (Smart Fallback)
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        await localVideo.play();
    } catch (e) {
        console.warn("Camera failed, trying Audio Only...");
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e2) {
            console.error("No media devices allowed.");
        }
    }

    // 2. Start Networking (This will now run even without a camera!)
    peer = new Peer();
    peer.on('open', id => {
        myIdDisplay.innerText = `Room ID: ${id}`;
        document.getElementById('status-text').innerText = localStream ? "Live & Secure" : "Whiteboard Mode (No Cam)";
        document.getElementById('status-dot').style.background = localStream ? "#40c057" : "#fab005";
        document.getElementById('launch-screen').style.display = 'none';
        renderStudents();
        
        const hash = window.location.hash.substring(1);
        if(hash && hash !== id) connectToClass(hash);
    });

    setupPeerListeners();
};

function setupPeerListeners() {
    peer.on('call', call => {
        const receivedPass = call.metadata ? call.metadata.password : '';
        const roomPass = document.getElementById('room-pass').value;
        let isAuthorized = (roomPass && receivedPass === roomPass);
        let studentName = "Student";

        for (let sId in students) {
            if (students[sId].code === receivedPass) {
                isAuthorized = true;
                studentName = students[sId].name;
                break;
            }
        }

        if (!isAuthorized) {
            alert("Blocked unauthorized entry attempt.");
            call.answer(); call.close(); return;
        }

        document.getElementById('student-knock-name').innerText = studentName + " Knocking";
        document.getElementById('security-modal').classList.remove('hidden');
        
        document.getElementById('admit-btn').onclick = () => {
            call.answer(localStream || new MediaStream());
            handleStream(call, studentName);
            document.getElementById('security-modal').classList.add('hidden');
        };
        document.getElementById('deny-btn').onclick = () => {
            call.close();
            document.getElementById('security-modal').classList.add('hidden');
        };
    });

    peer.on('connection', conn => {
        dataPeers[conn.peer] = conn;
        conn.on('data', data => handleData(data));
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
        div.innerHTML = `<div class="student-info"><span class="s-name">${students[id].name}</span><span class="s-code">Code: ${students[id].code}</span></div><button class="btn-del" onclick="deleteStudent('${id}')"><i class="fas fa-trash"></i></button>`;
        list.appendChild(div);
    }
}

window.deleteStudent = (id) => {
    delete students[id];
    localStorage.setItem('destiny_students', JSON.stringify(students));
    renderStudents();
};

// --- CONNECTIVITY ---
function connectToClass(id) {
    const pass = document.getElementById('room-pass').value;
    const call = peer.call(id, localStream || new MediaStream(), { metadata: { password: pass } });
    handleStream(call, "Teacher");
    const conn = peer.connect(id);
    dataPeers[id] = conn;
    conn.on('data', data => handleData(data));
}

document.getElementById('call-btn').onclick = () => {
    const id = document.getElementById('remote-id-input').value;
    if (id) connectToClass(id);
};

function handleStream(call, name) {
    calls[call.peer] = call;
    call.on('stream', stream => {
        let vid = document.getElementById(`vid-${call.peer}`);
        if (!vid) {
            const wrap = document.createElement('div');
            wrap.className = 'v-card remote';
            wrap.id = `wrap-${call.peer}`;
            vid = document.createElement('video');
            vid.id = `vid-${call.peer}`;
            vid.autoplay = true; vid.playsInline = true;
            const label = document.createElement('div');
            label.className = 'v-label'; label.innerText = name;
            wrap.appendChild(vid); wrap.appendChild(label);
            videoGrid.insertBefore(wrap, localVideo.parentElement);
        }
        vid.srcObject = stream;
    });
}

// --- TOOLS LOGIC ---
function broadcast(data) { Object.values(dataPeers).forEach(p => p.open && p.send(data)); }

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
    if(!localStream) return alert("Mic not available.");
    const t = localStream.getAudioTracks()[0]; t.enabled = !t.enabled;
    this.innerHTML = t.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
};

document.getElementById('cam-btn').onclick = function() {
    if(!localStream) return alert("Camera not available.");
    const t = localStream.getVideoTracks()[0]; t.enabled = !t.enabled;
    this.innerHTML = t.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
};

document.getElementById('copy-id-btn').onclick = () => {
    const id = myIdDisplay.innerText.replace('Room ID: ', '');
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${id}`);
    alert('Link Copied!');
};

// PRESENTATION ENGINE
document.getElementById('share-btn').onclick = async function() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = screenStream.getVideoTracks()[0];
        document.getElementById('status-text').innerText = "LIVE PRESENTING";
        document.getElementById('status-dot').style.background = "#ff6b6b";
        localVideo.srcObject = screenStream;

        Object.values(calls).forEach(call => {
            const s = call.peerConnection.getSenders().find(s => s.track.kind === 'video');
            if(s) s.replaceTrack(track);
        });

        track.onended = () => {
            document.getElementById('status-text').innerText = "Live & Ready";
            document.getElementById('status-dot').style.background = "#40c057";
            localVideo.srcObject = localStream;
        };
    } catch(err) {}
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
