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

// --- INITIALIZATION ---
document.getElementById('start-destiny-btn').onclick = async function() {
    this.innerText = "OPENING SECURE CHANNEL...";
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        await localVideo.play();

        peer = new Peer();
        peer.on('open', id => {
            myIdDisplay.innerText = `Room ID: ${id}`;
            document.getElementById('status-text').innerText = "Encrypted Connection Active";
            document.getElementById('launch-screen').style.display = 'none';
            renderStudents();
            
            const hash = window.location.hash.substring(1);
            if(hash && hash !== id) connectToClass(hash);
        });

        setupPeerListeners();
    } catch (e) {
        alert("Launch Failed: Camera access is mandatory for security.");
    }
};

function setupPeerListeners() {
    peer.on('call', call => {
        const receivedPass = call.metadata ? call.metadata.password : '';
        const roomPass = document.getElementById('room-pass').value;
        
        // Validation: Must match Room Pass OR an individual Student Code
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
        if (confirm(`Admit ${studentName} to the classroom?`)) {
            call.answer(localStream);
            handleStream(call, studentName);
        }
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
    
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code
    const id = "STU-" + Math.random().toString(36).substr(2, 4).toUpperCase();
    
    students[id] = { name, code };
    localStorage.setItem('destiny_students', JSON.stringify(students));
    
    document.getElementById('new-student-name').value = '';
    renderStudents();
    alert(`Invite Generated!\n\nID: ${id}\nCode: ${code}\n\nShare the Room Link + this Code with ${name}.`);
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
            <button class="btn-del" onclick="deleteStudent('${id}')"><i class="fas fa-trash"></i></button>
        `;
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
    const call = peer.call(id, localStream, { metadata: { password: pass } });
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
        vid.play().catch(() => {});
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
    const c = document.getElementById('board-color').value;
    draw(e.offsetX, e.offsetY, lx, ly, c, tool === 'eraser', true);
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
    const t = localStream.getAudioTracks()[0]; t.enabled = !t.enabled;
    this.innerHTML = t.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
};

document.getElementById('cam-btn').onclick = function() {
    const t = localStream.getVideoTracks()[0]; t.enabled = !t.enabled;
    this.innerHTML = t.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
};

document.getElementById('copy-id-btn').onclick = () => {
    const id = myIdDisplay.innerText.replace('Room ID: ', '');
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${id}`);
    alert('Room Link Copied!');
};

// Tabs
document.querySelectorAll('.nav-btn').forEach(b => {
    b.onclick = () => {
        document.querySelectorAll('.nav-btn, .tab-pane').forEach(el => el.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(`${b.dataset.tab}-tab`).classList.add('active');
    };
});

document.getElementById('send-chat').onclick = () => {
    const t = chatInput.value; if (!t) return;
    appendMsg('Me', t); broadcast({ type: 'chat', text: t }); chatInput.value = '';
};
function appendMsg(s, t) {
    const m = document.createElement('div'); m.className = 'chat-msg';
    m.innerHTML = `<span class="sender">${s}</span><span class="text">${t}</span>`;
    chatMessages.appendChild(m); chatMessages.scrollTop = chatMessages.scrollHeight;
}
