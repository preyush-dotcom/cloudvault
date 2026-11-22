// ============================================
// CLOUDVAULT - PERSONAL CLOUD STORAGE
// ============================================

const DB_NAME = 'cloudvault_db_v1';
const STORE = 'entries';
const MAX_STORAGE = 500 * 1024 * 1024;

let db;
let currentView = 'all';
let currentFolder = null;
let editingFolder = null;
let previewEntry = null;
let toastTimer;

const $ = id => document.getElementById(id);


// ============================================
// DATABASE
// ============================================

const requestDB = indexedDB.open(DB_NAME, 1);

requestDB.onupgradeneeded = () => {
    const d = requestDB.result;

    if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, {
            keyPath: 'id'
        });

        s.createIndex('parentId', 'parentId');
    }
};

requestDB.onsuccess = () => {
    db = requestDB.result;
    render();
};

requestDB.onerror = () => {
    notify('Could not open browser storage.');
};


// ============================================
// DATABASE FUNCTIONS
// ============================================

function allEntries() {
    return new Promise((resolve, reject) => {
        const r = db.transaction(STORE)
            .objectStore(STORE)
            .getAll();

        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}


function save(entry) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite');

        const request = transaction.objectStore(STORE).put(entry);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);

        request.onerror = () => reject(request.error);
    });
}


function remove(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite');

        transaction.objectStore(STORE).delete(id);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}


// ============================================
// UTILITIES
// ============================================

function uid() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + '-' + Math.random().toString(16).slice(2);
}


function fmtSize(n) {
    if (!n) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];

    let i = 0;

    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }

    return n.toFixed(i ? 1 : 0) + ' ' + units[i];
}


function dateFmt(d) {
    return new Date(d).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}


function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}


function notify(msg) {
    const t = $('toast');

    if (!t) {
        alert(msg);
        return;
    }

    t.textContent = msg;
    t.classList.add('show');

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        t.classList.remove('show');
    }, 2600);
}


function iconFor(e) {
    if (e.type === 'folder') return '📁';

    const ext = (e.name.split('.').pop() || '').toLowerCase();

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
        return '▧';

    if (ext === 'pdf')
        return 'PDF';

    if (['doc', 'docx', 'txt', 'rtf'].includes(ext))
        return '▤';

    if (['zip', 'rar', '7z'].includes(ext))
        return '▣';

    if (['mp4', 'mov', 'mkv'].includes(ext))
        return '▶';

    if (['mp3', 'wav'].includes(ext))
        return '♫';

    if (['xls', 'xlsx', 'csv'].includes(ext))
        return '▦';

    return '⌑';
}


// ============================================
// NAVIGATION
// ============================================

function setView(view, folderId = null) {
    currentView = view;
    currentFolder = folderId;

    document.querySelectorAll('.nav-item').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
    });

    render();
}


// ============================================
// DASHBOARD
// ============================================

async function render() {

    if (!db) return;

    try {

        const entries = await allEntries();

        const folders = entries.filter(e =>
            e.type === 'folder' && !e.trashed
        );

        const files = entries.filter(e =>
            e.type === 'file' && !e.trashed
        );


        // Statistics

        $('statFiles').textContent = files.length;

        $('statFolders').textContent = folders.length;

        $('statStarred').textContent =
            files.filter(e => e.starred).length;


        const used = files.reduce(
            (total, file) => total + (file.size || 0),
            0
        );

        $('statStorage').textContent = fmtSize(used);

        $('storageText').textContent =
            fmtSize(used) + ' of 500 MB used';

        $('storagePercent').textContent =
            Math.min(100, Math.round(used / MAX_STORAGE * 100)) + '%';

        $('storageBar').style.width =
            Math.min(100, used / MAX_STORAGE * 100) + '%';


        // Folder navigation

        renderFolderNav(folders);


        // File list

        let list = entries.filter(e => !e.trashed);

        let title = 'All files';

        let sub = 'Everything you store, organised in one place.';


        if (currentView === 'recent') {

            list = list
                .filter(e => e.type === 'file')
                .sort((a, b) => b.updated - a.updated);

            title = 'Recent';

            sub = 'Files you have worked with recently.';
        }


        else if (currentView === 'starred') {

            list = list.filter(e =>
                e.type === 'file' && e.starred
            );

            title = 'Starred';

            sub = 'Your favourite files, all together.';
        }


        else if (currentView === 'trash') {

            list = entries.filter(e => e.trashed);

            title = 'Trash';

            sub = 'Restore items or permanently delete them.';
        }


        else if (currentView === 'folder') {

            const folder = folders.find(f => f.id === currentFolder);

            title = folder ? folder.name : 'Folder';

            sub = 'Files and folders in this location.';

            list = list.filter(e => e.parentId === currentFolder);
        }


        else {

            list = list.filter(e =>
                e.parentId === null ||
                e.parentId === undefined
            );
        }


        // Search

        const q = $('search').value.trim().toLowerCase();

        if (q) {

            list = entries.filter(e =>
                !e.trashed &&
                e.name.toLowerCase().includes(q)
            );

            title = 'Search results';

            sub = 'Matching files and folders.';
        }


        // Sorting

        const sort = $('sort').value;

        if (sort === 'name')
            list.sort((a, b) => a.name.localeCompare(b.name));

        if (sort === 'newest')
            list.sort((a, b) => b.updated - a.updated);

        if (sort === 'oldest')
            list.sort((a, b) => a.updated - b.updated);

        if (sort === 'size')
            list.sort((a, b) => (b.size || 0) - (a.size || 0));


        // Dashboard headings

        $('title').textContent = title;

        $('crumb').textContent = title;

        $('subtitle').textContent = sub;

        $('listTitle').textContent =
            q ? 'Search results' :
            title === 'All files' ? 'Your files' :
            title;

        $('listSub').textContent = list.length
            ? `${list.length} item${list.length === 1 ? '' : 's'}`
            : 'Nothing here yet';


        // File list

        const host = $('items');

        if (!list.length) {

            host.innerHTML = `
                <div class="empty">

                    <div class="empty-icon">
                        ${currentView === 'trash' ? '♲' : '☁'}
                    </div>

                    <h3>
                        ${q
                            ? 'No matching items'
                            : currentView === 'trash'
                                ? 'Trash is empty'
                                : 'Nothing here yet'}
                    </h3>

                    <p>
                        ${q
                            ? 'Try another search term.'
                            : 'Upload a file or create a folder to get started.'}
                    </p>

                    ${currentView === 'all' && !q
                        ? '<button class="primary" id="emptyUpload">Upload your first file</button>'
                        : ''}
                </div>
            `;

            const b = $('emptyUpload');

            if (b) b.onclick = pickFiles;

        }

        else {

            host.innerHTML = list.map(e => rowHTML(e)).join('');

        }


        // Action buttons

        $('items').querySelectorAll('[data-action]').forEach(b => {

            b.addEventListener('click', () => {
                handleAction(b.dataset.action, b.dataset.id);
            });

        });


        // Open files

        $('items').querySelectorAll('[data-open]').forEach(el => {

            el.addEventListener('click', () => {
                openEntry(el.dataset.open);
            });

        });

    }

    catch (error) {

        console.error('Dashboard rendering error:', error);

        notify('Could not display files.');

    }

}


// ============================================
// FILE ROW
// ============================================

function rowHTML(e) {

    const isFolder = e.type === 'folder';

    const trash = !!e.trashed;

    let actions = '';


    if (trash) {

        actions = `
            <button class="action"
                data-action="restore"
                data-id="${e.id}"
                title="Restore">
                ↶
            </button>

            <button class="action danger"
                data-action="permanent"
                data-id="${e.id}"
                title="Delete permanently">
                ×
            </button>
        `;

    }


    else if (isFolder) {

        actions = `
            <button class="action"
                data-action="rename"
                data-id="${e.id}"
                title="Rename">
                ✎
            </button>

            <button class="action danger"
                data-action="delete"
                data-id="${e.id}"
                title="Move to trash">
                ♲
            </button>
        `;

    }


    else {

        actions = `
            <button class="action"
                data-action="star"
                data-id="${e.id}"
                title="Star">
                ${e.starred ? '★' : '☆'}
            </button>

            <button class="action"
                data-action="download"
                data-id="${e.id}"
                title="Download">
                ↓
            </button>

            <button class="action"
                data-action="rename"
                data-id="${e.id}"
                title="Rename">
                ✎
            </button>

            <button class="action danger"
                data-action="delete"
                data-id="${e.id}"
                title="Move to trash">
                ♲
            </button>
        `;

    }


    return `
        <div class="file-row">

            <div class="file-name">

                <div class="file-icon ${isFolder ? 'folder' : ''}">
                    ${iconFor(e)}
                </div>

                <div style="min-width:0">

                    <div class="file-title" data-open="${e.id}">
                        ${esc(e.name)}
                        ${e.starred ? '★' : ''}
                    </div>

                    <div class="file-sub">
                        ${isFolder ? 'Folder' : (e.mime || 'File')}
                    </div>

                </div>

            </div>

            <span class="date muted">
                ${dateFmt(e.updated)}
            </span>

            <span class="size muted">
                ${isFolder ? '—' : fmtSize(e.size)}
            </span>

            <div class="row-actions">
                ${actions}
            </div>

        </div>
    `;
}


// ============================================
// FOLDERS
// ============================================

function renderFolderNav(folders) {

    $('folderNav').innerHTML = folders
        .filter(f => !f.parentId)
        .map(f => `
            <button class="folder-link ${
                currentView === 'folder' && currentFolder === f.id
                    ? 'selected'
                    : ''
            }" data-folder="${f.id}">

                📁

                <span class="folder-name">
                    ${esc(f.name)}
                </span>

            </button>
        `)
        .join('');


    $('folderNav').querySelectorAll('[data-folder]').forEach(b => {

        b.onclick = () => setView('folder', b.dataset.folder);

    });

}


// ============================================
// OPEN FILES
// ============================================

async function openEntry(id) {

    const entries = await allEntries();

    const e = entries.find(x => x.id === id);

    if (!e) return;

    if (e.type === 'folder') {

        setView('folder', e.id);

        return;

    }

    showPreview(e);

}


// ============================================
// FILE ACTIONS
// ============================================

async function handleAction(action, id) {

    const entries = await allEntries();

    const e = entries.find(x => x.id === id);

    if (!e) return;


    if (action === 'star') {

        e.starred = !e.starred;

        await save(e);

        notify(e.starred ? 'Added to Starred' : 'Removed from Starred');

    }


    if (action === 'delete') {

        e.trashed = true;

        e.updated = Date.now();

        await save(e);

        notify('Moved to Trash');

    }


    if (action === 'restore') {

        e.trashed = false;

        e.updated = Date.now();

        await save(e);

        notify('Item restored');

    }


    if (action === 'permanent') {

        if (!confirm(`Permanently delete "${e.name}"?`))
            return;

        await remove(id);

        notify('Permanently deleted');

    }


    if (action === 'download') {

        downloadEntry(e);

    }


    if (action === 'rename') {

        const name = prompt('Enter a new name:', e.name);

        if (name && name.trim()) {

            e.name = name.trim();

            e.updated = Date.now();

            await save(e);

            notify('Renamed successfully');

        }

    }


    await render();

}


// ============================================
// UPLOAD FILES - FIXED
// ============================================

function pickFiles() {

    const picker = $('filePicker');

    if (!picker) {

        notify('File picker is missing.');

        return;

    }

    picker.click();

}


async function uploadFiles(fileList) {

    const files = Array.from(fileList || []);

    if (!files.length) {

        notify('No files selected.');

        return;

    }


    if (!db) {

        notify('Storage is still loading. Please try again.');

        return;

    }


    try {

        let uploadedCount = 0;

        const existingEntries = await allEntries();


        for (const file of files) {

            const currentEntries = await allEntries();

            const used = currentEntries
                .filter(e => e.type === 'file' && !e.trashed)
                .reduce((total, e) => total + (e.size || 0), 0);


            if (used + file.size > MAX_STORAGE) {

                notify('Storage limit of 500 MB reached.');

                continue;

            }


            const entry = {

                id: uid(),

                type: 'file',

                name: file.name,

                size: file.size,

                mime: file.type || 'application/octet-stream',

                blob: file,

                parentId: currentView === 'folder'
                    ? currentFolder
                    : null,

                starred: false,

                trashed: false,

                created: Date.now(),

                updated: Date.now()

            };


            // Save file to IndexedDB

            await save(entry);


            uploadedCount++;

        }


        // Refresh dashboard after uploading

        await render();


        if (uploadedCount > 0) {

            notify(
                `${uploadedCount} file${uploadedCount === 1 ? '' : 's'} uploaded successfully!`
            );

        }


    }

    catch (error) {

        console.error('Upload error:', error);

        notify('Upload failed: ' + error.message);

    }

}


// ============================================
// DOWNLOAD
// ============================================

function downloadEntry(e) {

    if (!e.blob) {

        notify('File data is missing.');

        return;

    }

    const url = URL.createObjectURL(e.blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = e.name;

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);

}


// ============================================
// PREVIEW
// ============================================

async function showPreview(e) {

    previewEntry = e;

    $('previewName').textContent = e.name;

    $('previewInfo').textContent =
        `${fmtSize(e.size)} · ${e.mime || 'File'}`;

    const box = $('previewContent');

    box.innerHTML = '';

    const url = URL.createObjectURL(e.blob);


    if (e.mime.startsWith('image/')) {

        const img = document.createElement('img');

        img.src = url;

        box.append(img);

    }


    else if (e.mime === 'application/pdf') {

        const frame = document.createElement('iframe');

        frame.src = url;

        box.append(frame);

    }


    else if (
        e.mime.startsWith('text/') ||
        /\.(txt|csv|json|html|css|js|md)$/i.test(e.name)
    ) {

        const text = await e.blob.text();

        box.textContent = text.slice(0, 100000);

    }


    else {

        box.textContent =
            'Preview is not available for this file type. Use Download to open it on your device.';

    }


    box.dataset.url = url;

    $('previewModal').showModal();

}


function closePreview() {

    const url = $('previewContent').dataset.url;

    if (url) URL.revokeObjectURL(url);

    $('previewModal').close();

}


// ============================================
// FOLDER MODAL
// ============================================

function openFolderModal(id = null) {

    editingFolder = id;

    $('folderModalTitle').textContent =
        id ? 'Rename folder' : 'Create a folder';

    $('folderName').value = id
        ? $('folderNav').querySelector(`[data-folder="${id}"]`)
            ?.textContent.trim() || ''
        : '';

    $('folderModal').showModal();

    $('folderName').focus();

}


$('folderForm').addEventListener('submit', async ev => {

    ev.preventDefault();

    const name = $('folderName').value.trim();

    if (!name) return;


    const entries = await allEntries();


    if (editingFolder) {

        const e = entries.find(x => x.id === editingFolder);

        if (e) {

            e.name = name;

            e.updated = Date.now();

            await save(e);

        }

    }


    else {

        await save({

            id: uid(),

            type: 'folder',

            name,

            parentId: currentView === 'folder'
                ? currentFolder
                : null,

            created: Date.now(),

            updated: Date.now(),

            trashed: false

        });

    }


    $('folderModal').close();

    notify(editingFolder ? 'Folder renamed' : 'Folder created');

    await render();

});


// ============================================
// MAIN BUTTONS
// ============================================

$('uploadBtn').onclick =
$('headingUpload').onclick =
    pickFiles;


$('addFolderBtn').onclick = () => openFolderModal();


$('filePicker').onchange = async e => {

    const files = Array.from(e.target.files || []);

    e.target.value = '';


    try {

        await uploadFiles(files);

    }

    catch (error) {

        console.error(error);

        notify('Upload failed: ' + error.message);

    }

};


$('search').oninput = render;

$('sort').onchange = render;

$('refresh').onclick = render;


$('homeLink').onclick = e => {

    e.preventDefault();

    $('search').value = '';

    setView('all');

};


$('downloadPreview').onclick = () => {

    if (previewEntry) {

        downloadEntry(previewEntry);

    }

};


$('aboutBtn').onclick = () => {

    alert(
        'CloudVault is a front-end prototype. ' +
        'Files are stored locally in your browser. ' +
        'Online cloud sync, accounts, and server-side security are not connected yet.'
    );

};


$('mobileMenu').onclick = () => {

    $('sidebar').classList.toggle('open');

};


// ============================================
// NAVIGATION BUTTONS
// ============================================

document.querySelectorAll('.nav-item').forEach(b => {

    b.onclick = () => {

        $('search').value = '';

        $('sidebar').classList.remove('open');

        setView(b.dataset.view);

    };

});


// ============================================
// CLOSE MODALS
// ============================================

document.querySelectorAll('[data-close]').forEach(b => {

    b.onclick = () => {

        $(b.dataset.close).close();

    };

});


$('previewModal').querySelectorAll('[data-close]').forEach(b => {

    b.onclick = closePreview;

});


// ============================================
// SEARCH KEYBOARD
// ============================================

$('search').addEventListener('keydown', e => {

    if (e.key === 'Escape') {

        $('search').value = '';

        render();

    }

});


// ============================================
// KEYBOARD SHORTCUT
// ============================================

document.addEventListener('keydown', e => {

    if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'k'
    ) {

        e.preventDefault();

        $('search').focus();

    }

});


// ============================================
// INITIALIZE
// ============================================

render();
