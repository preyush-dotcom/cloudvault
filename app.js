// ==========================================
// CLOUDVAULT - COMPLETE WORKING APP
// ==========================================

const DB_NAME = "cloudvault_db_v1";
const STORE_NAME = "entries";
const MAX_STORAGE = 500 * 1024 * 1024;

let db;
let currentView = "all";
let currentFolder = null;
let listMode = "grid";
let toastTimer;

const $ = id => document.getElementById(id);


// ==========================================
// DATABASE
// ==========================================

function openDatabase() {

    return new Promise((resolve, reject) => {

        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = function () {

            const database = request.result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {

                database.createObjectStore(STORE_NAME, {
                    keyPath: "id"
                });

            }

        };

        request.onsuccess = function () {

            db = request.result;

            resolve(db);

        };

        request.onerror = function () {

            reject(request.error);

        };

    });

}


function getAllEntries() {

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            STORE_NAME,
            "readonly"
        );

        const request = transaction
            .objectStore(STORE_NAME)
            .getAll();

        request.onsuccess = () => resolve(request.result);

        request.onerror = () => reject(request.error);

    });

}


function saveEntry(entry) {

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            STORE_NAME,
            "readwrite"
        );

        transaction
            .objectStore(STORE_NAME)
            .put(entry);

        transaction.oncomplete = () => resolve();

        transaction.onerror = () => reject(transaction.error);

        transaction.onabort = () => reject(transaction.error);

    });

}


function deleteEntry(id) {

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            STORE_NAME,
            "readwrite"
        );

        transaction
            .objectStore(STORE_NAME)
            .delete(id);

        transaction.oncomplete = () => resolve();

        transaction.onerror = () => reject(transaction.error);

    });

}


// ==========================================
// UTILITIES
// ==========================================

function createID() {

    return crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + Math.random().toString(16);

}


function formatSize(bytes) {

    if (!bytes) return "0 B";

    const units = ["B", "KB", "MB", "GB"];

    let index = 0;

    while (bytes >= 1024 && index < units.length - 1) {

        bytes /= 1024;

        index++;

    }

    return bytes.toFixed(index === 0 ? 0 : 1)
        + " "
        + units[index];

}


function formatDate(timestamp) {

    return new Date(timestamp).toLocaleDateString(
        undefined,
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );

}


function escapeHTML(value) {

    return String(value).replace(/[&<>"']/g, function (char) {

        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[char];

    });

}


function showToast(message) {

    const toast = $("toast");

    if (!toast) {

        console.log(message);

        return;

    }

    toast.textContent = message;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {

        toast.classList.remove("show");

    }, 3000);

}


function getFileIcon(file) {

    if (file.type === "folder") {

        return "📁";

    }

    const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

    if (
        ["jpg", "jpeg", "png", "gif", "webp", "svg"]
            .includes(extension)
    ) {

        return "🖼️";

    }

    if (extension === "pdf") {

        return "📕";

    }

    if (
        ["doc", "docx", "txt"]
            .includes(extension)
    ) {

        return "📄";

    }

    if (
        ["mp4", "mov", "avi"]
            .includes(extension)
    ) {

        return "🎥";

    }

    if (
        ["mp3", "wav"]
            .includes(extension)
    ) {

        return "🎵";

    }

    if (
        ["zip", "rar"]
            .includes(extension)
    ) {

        return "📦";

    }

    return "📄";

}


// ==========================================
// TOAST
// ==========================================


// ==========================================
// UPLOAD
// ==========================================

function openFilePicker() {

    const input = $("fileInput");

    if (input) {

        input.click();

    }

}


async function uploadFiles(fileList) {

    const files = Array.from(fileList || []);

    if (files.length === 0) {

        return;

    }

    if (!db) {

        showToast("Storage is not ready. Please try again.");

        return;

    }

    try {

        let successfulUploads = 0;

        for (const file of files) {

            const entries = await getAllEntries();

            const usedStorage = entries

                .filter(entry =>
                    entry.type === "file" &&
                    !entry.trashed
                )

                .reduce(
                    (total, entry) =>
                        total + (entry.size || 0),
                    0
                );


            if (usedStorage + file.size > MAX_STORAGE) {

                showToast("Storage limit exceeded!");

                continue;

            }


            const newEntry = {

                id: createID(),

                type: "file",

                name: file.name,

                size: file.size,

                mime: file.type || "application/octet-stream",

                blob: file,

                parentId: currentView === "folder"
                    ? currentFolder
                    : null,

                starred: false,

                trashed: false,

                created: Date.now(),

                updated: Date.now()

            };


            // Save actual file data

            await saveEntry(newEntry);

            successfulUploads++;

        }


        // Refresh dashboard

        await renderDashboard();


        if (successfulUploads > 0) {

            showToast(
                successfulUploads +
                " file(s) uploaded successfully!"
            );

        }

    }

    catch (error) {

        console.error("Upload error:", error);

        showToast("Upload failed: " + error.message);

    }

}


// ==========================================
// DASHBOARD
// ==========================================

async function renderDashboard() {

    if (!db) return;

    try {

        const entries = await getAllEntries();

        const files = entries.filter(entry =>
            entry.type === "file" &&
            !entry.trashed
        );

        const folders = entries.filter(entry =>
            entry.type === "folder" &&
            !entry.trashed
        );


        // FILE COUNT

        $("fileCount").textContent = files.length;


        // FOLDER COUNT

        $("folderCount").textContent = folders.length;


        // STARRED COUNT

        $("starCount").textContent =
            files.filter(file => file.starred).length;


        // STORAGE

        const usedStorage = files.reduce(
            (total, file) => total + (file.size || 0),
            0
        );

        $("storageStat").textContent =
            formatSizeMB(usedStorage);

        $("storageUsed").textContent =
            formatSizeMB(usedStorage);

        const percentage = Math.min(
            100,
            (usedStorage / MAX_STORAGE) * 100
        );

        $("storagePercent").textContent =
            Math.round(percentage) + "% used";

        $("storageBar").style.width =
            percentage + "%";


        // FILTER ITEMS

        let visibleEntries = entries.filter(
            entry => !entry.trashed
        );


        // ALL FILES

        if (currentView === "all") {

            visibleEntries = visibleEntries.filter(
                entry => !entry.parentId
            );

            $("pageTitle").textContent = "My files";

            $("pageDescription").textContent =
                "Everything you keep, all in one place.";

        }


        // RECENT

        else if (currentView === "recent") {

            visibleEntries = visibleEntries

                .filter(entry => entry.type === "file")

                .sort((a, b) => b.updated - a.updated)

                .slice(0, 20);

            $("pageTitle").textContent = "Recent";

            $("pageDescription").textContent =
                "Your recently uploaded files.";

        }


        // STARRED

        else if (currentView === "starred") {

            visibleEntries = visibleEntries.filter(
                entry => entry.starred
            );

            $("pageTitle").textContent = "Starred";

            $("pageDescription").textContent =
                "Your favourite files.";

        }


        // SHARED

        else if (currentView === "shared") {

            visibleEntries = [];

            $("pageTitle").textContent = "Shared";

            $("pageDescription").textContent =
                "Shared files will appear here.";

        }


        // FOLDERS

        else if (currentView === "folders") {

            visibleEntries = folders;

            $("pageTitle").textContent = "Folders";

            $("pageDescription").textContent =
                "Your organized collections.";

        }


        // TRASH

        else if (currentView === "trash") {

            visibleEntries = entries.filter(
                entry => entry.trashed
            );

            $("pageTitle").textContent = "Trash";

            $("pageDescription").textContent =
                "Deleted files and folders.";

        }


        // OPEN FOLDER

        else if (currentView === "folder") {

            visibleEntries = entries.filter(
                entry =>
                    entry.parentId === currentFolder &&
                    !entry.trashed
            );

            const folder = entries.find(
                entry => entry.id === currentFolder
            );

            $("pageTitle").textContent =
                folder ? folder.name : "Folder";

            $("pageDescription").textContent =
                "Files inside this folder.";

        }


        // SEARCH

        const searchValue = $("searchInput").value
            .trim()
            .toLowerCase();

        if (searchValue) {

            visibleEntries = entries.filter(
                entry =>
                    !entry.trashed &&
                    entry.name.toLowerCase()
                        .includes(searchValue)
            );

            $("pageTitle").textContent = "Search results";

            $("pageDescription").textContent =
                "Files matching your search.";

        }


        // SORT

        const sortValue = $("sortSelect").value;

        if (sortValue === "name") {

            visibleEntries.sort(
                (a, b) => a.name.localeCompare(b.name)
            );

        }

        else if (sortValue === "newest") {

            visibleEntries.sort(
                (a, b) => b.updated - a.updated
            );

        }

        else if (sortValue === "oldest") {

            visibleEntries.sort(
                (a, b) => a.updated - b.updated
            );

        }

        else if (sortValue === "largest") {

            visibleEntries.sort(
                (a, b) => (b.size || 0) - (a.size || 0)
            );

        }


        // RENDER

        renderFiles(visibleEntries);

        renderFolders(entries);

        updateNavigation();

    }

    catch (error) {

        console.error("Dashboard error:", error);

        showToast("Could not load dashboard.");

    }

}


// ==========================================
// SIZE FORMAT
// ==========================================

function formatSizeMB(bytes) {

    if (bytes < 1024 * 1024) {

        return (bytes / 1024).toFixed(1) + " KB";

    }

    return (bytes / (1024 * 1024)).toFixed(2) + " MB";

}


// ==========================================
// FILE DISPLAY
// ==========================================

function renderFiles(entries) {

    const area = $("fileArea");

    const empty = $("emptyState");

    if (!area) return;


    const files = entries.filter(
        entry => entry.type === "file"
    );

    const folders = entries.filter(
        entry => entry.type === "folder"
    );


    if (files.length === 0 && folders.length === 0) {

        area.innerHTML = "";

        empty.classList.remove("hidden");

        return;

    }


    empty.classList.add("hidden");


    area.innerHTML = entries.map(entry => {

        const icon = getFileIcon(entry);

        const isFolder = entry.type === "folder";

        const size = isFolder
            ? "Folder"
            : formatSize(entry.size);


        return `

        <div class="file-card">

            <div class="file-card-top">

                <div class="file-icon">

                    ${icon}

                </div>

                <div class="file-actions">

                    ${
                        entry.type === "file"
                        ?
                        `<button
                            class="file-action"
                            data-star="${entry.id}"
                            title="Star">
                            ${entry.starred ? "★" : "☆"}
                        </button>`
                        :
                        ""
                    }

                    <button
                        class="file-action"
                        data-delete="${entry.id}"
                        title="Delete">
                        🗑
                    </button>

                </div>

            </div>

            <div class="file-card-name"
                data-open="${entry.id}">

                ${escapeHTML(entry.name)}

            </div>

            <div class="file-card-info">

                <span>${size}</span>

                <span>${formatDate(entry.updated)}</span>

            </div>

            ${
                entry.type === "file"
                ?
                `<button
                    class="download-button"
                    data-download="${entry.id}">
                    ↓ Download
                </button>`
                :
                `<button
                    class="download-button"
                    data-folder="${entry.id}">
                    Open folder →
                </button>`
            }

        </div>

        `;

    }).join("");


    // STAR BUTTONS

    area.querySelectorAll("[data-star]").forEach(button => {

        button.onclick = async function () {

            const id = button.dataset.star;

            const entry = await findEntry(id);

            if (!entry) return;

            entry.starred = !entry.starred;

            await saveEntry(entry);

            await renderDashboard();

        };

    });


    // DELETE BUTTONS

    area.querySelectorAll("[data-delete]").forEach(button => {

        button.onclick = async function () {

            const id = button.dataset.delete;

            const entry = await findEntry(id);

            if (!entry) return;

            entry.trashed = true;

            entry.updated = Date.now();

            await saveEntry(entry);

            showToast("Moved to trash");

            await renderDashboard();

        };

    });


    // DOWNLOAD

    area.querySelectorAll("[data-download]").forEach(button => {

        button.onclick = async function () {

            const entry = await findEntry(
                button.dataset.download
            );

            if (entry) downloadFile(entry);

        };

    });


    // OPEN

    area.querySelectorAll("[data-open]").forEach(element => {

        element.onclick = async function () {

            const entry = await findEntry(
                element.dataset.open
            );

            if (!entry) return;

            if (entry.type === "folder") {

                currentView = "folder";

                currentFolder = entry.id;

                await renderDashboard();

            }

            else {

                previewFile(entry);

            }

        };

    });


    // FOLDER BUTTON

    area.querySelectorAll("[data-folder]").forEach(button => {

        button.onclick = async function () {

            currentView = "folder";

            currentFolder = button.dataset.folder;

            await renderDashboard();

        };

    });

}


// ==========================================
// FOLDER DISPLAY
// ==========================================

function renderFolders(entries) {

    const area = $("folderArea");

    if (!area) return;

    const folders = entries.filter(
        entry =>
            entry.type === "folder" &&
            !entry.trashed &&
            !entry.parentId
    );


    area.innerHTML = folders.map(folder => `

        <div class="folder-card"
            data-open-folder="${folder.id}">

            <div class="folder-icon">📁</div>

            <div class="folder-name">

                ${escapeHTML(folder.name)}

            </div>

        </div>

    `).join("");


    area.querySelectorAll("[data-open-folder]").forEach(
        element => {

            element.onclick = async function () {

                currentView = "folder";

                currentFolder =
                    element.dataset.openFolder;

                await renderDashboard();

            };

        }
    );

}


// ==========================================
// FIND ENTRY
// ==========================================

async function findEntry(id) {

    const entries = await getAllEntries();

    return entries.find(entry => entry.id === id);

}


// ==========================================
// DOWNLOAD
// ==========================================

function downloadFile(entry) {

    if (!entry.blob) {

        showToast("File data not found.");

        return;

    }

    const url = URL.createObjectURL(entry.blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = entry.name;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(() => {

        URL.revokeObjectURL(url);

    }, 2000);

}


// ==========================================
// PREVIEW
// ==========================================

function previewFile(entry) {

    if (!entry.blob) {

        showToast("File data unavailable.");

        return;

    }

    if (entry.mime && entry.mime.startsWith("image/")) {

        const url = URL.createObjectURL(entry.blob);

        const modal = $("modalBackdrop");

        const content = $("modalContent");

        content.innerHTML = `

            <h2>${escapeHTML(entry.name)}</h2>

            <img
                src="${url}"
                style="
                    max-width:100%;
                    max-height:70vh;
                    display:block;
                    margin:auto;
                "
            >

        `;

        modal.classList.remove("hidden");

        return;

    }


    downloadFile(entry);

    showToast("Downloading file...");

}


// ==========================================
// CREATE FOLDER
// ==========================================

async function createFolder() {

    const name = prompt("Enter folder name:");

    if (!name || !name.trim()) return;


    const folder = {

        id: createID(),

        type: "folder",

        name: name.trim(),

        parentId: currentView === "folder"
            ? currentFolder
            : null,

        created: Date.now(),

        updated: Date.now(),

        trashed: false,

        starred: false

    };


    await saveEntry(folder);

    showToast("Folder created successfully!");

    await renderDashboard();

}


// ==========================================
// NAVIGATION
// ==========================================

function updateNavigation() {

    document.querySelectorAll(".nav-item").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.view === currentView
        );

    });

}


function changeView(view) {

    currentView = view;

    currentFolder = null;

    renderDashboard();

}


// ==========================================
// BUTTONS
// ==========================================

$("uploadButton").onclick = openFilePicker;

$("heroUpload").onclick = openFilePicker;

$("emptyUpload").onclick = openFilePicker;

$("newFolderButton").onclick = createFolder;


$("fileInput").addEventListener(
    "change",
    async function (event) {

        const files = event.target.files;

        await uploadFiles(files);

        event.target.value = "";

    }
);


$("searchInput").addEventListener(
    "input",
    renderDashboard
);


$("sortSelect").addEventListener(
    "change",
    renderDashboard
);


$("gridView").onclick = function () {

    listMode = "grid";

    $("gridView").classList.add("selected");

    $("listView").classList.remove("selected");

    $("fileArea").classList.remove("list-mode");

};


$("listView").onclick = function () {

    listMode = "list";

    $("listView").classList.add("selected");

    $("gridView").classList.remove("selected");

    $("fileArea").classList.add("list-mode");

};


$("mobileMenu").onclick = function () {

    $("sidebar").classList.toggle("open");

};


$("modalClose").onclick = function () {

    $("modalBackdrop").classList.add("hidden");

};


$("modalBackdrop").onclick = function (event) {

    if (event.target === $("modalBackdrop")) {

        $("modalBackdrop").classList.add("hidden");

    }

};


// ==========================================
// SIDEBAR NAVIGATION
// ==========================================

document.querySelectorAll(".nav-item").forEach(button => {

    button.onclick = function () {

        changeView(button.dataset.view);

    };

});


// ==========================================
// KEYBOARD SEARCH
// ==========================================

document.addEventListener("keydown", function (event) {

    if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
    ) {

        event.preventDefault();

        $("searchInput").focus();

    }

});


// ==========================================
// INITIALIZE
// ==========================================

async function initializeCloudVault() {

    try {

        await openDatabase();

        await renderDashboard();

        console.log("CloudVault initialized successfully.");

    }

    catch (error) {

        console.error("CloudVault initialization error:", error);

        showToast("Could not initialize CloudVault.");

    }

}


initializeCloudVault();
