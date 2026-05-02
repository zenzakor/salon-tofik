import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    updateDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const ADMIN_EMAIL = "admin@tofik.com";
const firebaseConfig = {
    apiKey: "AIzaSyACn-sXRnniaNvtV97KWg43O5MrvvB8VD8",
    authDomain: "salon-tofik.firebaseapp.com",
    projectId: "salon-tofik",
    storageBucket: "salon-tofik.firebasestorage.app",
    messagingSenderId: "479343315632",
    appId: "1:479343315632:web:ba955286e8c18d60bcc975"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const text = {
    ar: {
        notifications: "الإشعارات",
        adminTitle: "مركز الإشعارات",
        adminHint: "هنا تظهر الحجوزات والطلبات والتعليقات والتحديثات المهمة فور وصولها.",
        noNotifications: "لا توجد إشعارات حتى الآن.",
        markAllRead: "قراءة الكل",
        markRead: "تمت القراءة",
        unread: "جديد",
        open: "فتح الإشعارات",
        close: "إغلاق",
        bell: "إشعارات"
    },
    he: {
        notifications: "התראות",
        adminTitle: "מרכז התראות",
        adminHint: "כאן מופיעים תורים, הזמנות, ביקורות ועדכונים חשובים בזמן אמת.",
        noNotifications: "אין התראות עדיין.",
        markAllRead: "סימון הכל כנקרא",
        markRead: "נקרא",
        unread: "חדש",
        open: "פתיחת התראות",
        close: "סגירה",
        bell: "התראות"
    },
    en: {
        notifications: "Notifications",
        adminTitle: "Notification Center",
        adminHint: "Bookings, orders, reviews, and important updates appear here in real time.",
        noNotifications: "No notifications yet.",
        markAllRead: "Mark all read",
        markRead: "Read",
        unread: "New",
        open: "Open notifications",
        close: "Close",
        bell: "Alerts"
    }
};

Object.assign(text.ar, {
    delete: "\u062d\u0630\u0641",
    deleteConfirm: "\u0647\u0644 \u0623\u0646\u062a \u0645\u062a\u0623\u0643\u062f \u0623\u0646\u0643 \u062a\u0631\u064a\u062f \u062d\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u061f"
});
Object.assign(text.he, {
    delete: "\u05de\u05d7\u05d9\u05e7\u05d4",
    deleteConfirm: "\u05dc\u05de\u05d7\u05d5\u05e7 \u05d0\u05ea \u05d4\u05d4\u05ea\u05e8\u05d0\u05d4 \u05d4\u05d6\u05d0\u05ea?"
});
Object.assign(text.en, {
    delete: "Delete",
    deleteConfirm: "Are you sure you want to delete this notification?"
});

const state = {
    currentTargetId: "",
    currentTargetType: "",
    initializedSnapshot: false,
    notifications: [],
    unsubscribe: null
};

function lang() {
    return localStorage.getItem("salonLang") || "ar";
}

function t(key) {
    const selected = lang();
    return text[selected]?.[key] || text.ar[key] || key;
}

function safeText(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));
}

function addStylesheet() {
    if (document.querySelector('link[href="assets/notifications.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "assets/notifications.css";
    document.head.appendChild(link);
}

function isAdminPage() {
    return document.body.classList.contains("admin-page");
}

function notificationIcon(type) {
    if (type === "booking") return "calendar_month";
    if (type === "order") return "shopping_cart";
    if (type === "review") return "rate_review";
    if (type === "account") return "person";
    if (type === "warning") return "warning";
    return "notifications";
}

function formatTime(notification) {
    const dateValue = notification.createdAtMs || notification.createdAt;
    const date = dateValue ? new Date(dateValue) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    try {
        return new Intl.DateTimeFormat(lang(), {
            dateStyle: "short",
            timeStyle: "short"
        }).format(date);
    } catch {
        return date.toLocaleString();
    }
}

function getOrCreateToastStack() {
    let stack = document.getElementById("notificationToastStack");
    if (stack) return stack;
    stack = document.createElement("div");
    stack.id = "notificationToastStack";
    stack.className = "notification-toast-stack";
    stack.setAttribute("aria-live", "polite");
    document.body.appendChild(stack);
    return stack;
}

function showToast(notification) {
    const stack = getOrCreateToastStack();
    const toast = document.createElement("div");
    toast.className = "notification-toast";
    toast.innerHTML = `
        <span class="material-symbols-outlined">${notificationIcon(notification.type)}</span>
        <div>
            <strong>${safeText(notification.title)}</strong>
            <small>${safeText(notification.body)}</small>
        </div>
    `;
    stack.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-8px)";
        setTimeout(() => toast.remove(), 240);
    }, 4600);
}

function buildPanel() {
    if (document.getElementById("notificationPanel")) return;
    const panel = document.createElement("section");
    panel.id = "notificationPanel";
    panel.className = "notification-panel";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
        <div class="notification-panel-header">
            <h3 id="notificationPanelTitle">${t("notifications")}</h3>
            <div class="notification-panel-actions">
                <button id="markAllNotificationsRead" type="button">${t("markAllRead")}</button>
                <button id="closeNotificationPanel" type="button" aria-label="${t("close")}">×</button>
            </div>
        </div>
        <div id="notificationList" class="notification-list"></div>
    `;
    document.body.appendChild(panel);
    document.getElementById("closeNotificationPanel").addEventListener("click", closePanel);
    document.getElementById("markAllNotificationsRead").addEventListener("click", markAllRead);
}

function buildUserTrigger() {
    const nav = document.querySelector("header nav") || document.querySelector("header .nav-right nav");
    if (!nav || document.getElementById("siteNotificationTrigger")) return;
    const trigger = document.createElement("button");
    trigger.id = "siteNotificationTrigger";
    trigger.className = "nav-item site-notification-trigger";
    trigger.type = "button";
    trigger.hidden = true;
    trigger.setAttribute("aria-label", t("open"));
    trigger.innerHTML = `
        <span class="material-symbols-outlined nav-icon">notifications</span>
        <span class="nav-text">${t("bell")}</span>
        <span id="siteNotificationCount" class="site-notification-count">0</span>
    `;
    const profile = document.getElementById("profileBtn");
    if (profile && profile.parentElement === nav) nav.insertBefore(trigger, profile);
    else {
        const settings = document.getElementById("settingsBtn");
        if (settings && settings.parentElement === nav) nav.insertBefore(trigger, settings);
        else nav.appendChild(trigger);
    }
    trigger.addEventListener("click", togglePanel);
}

function setUserTriggerVisible(visible) {
    const trigger = document.getElementById("siteNotificationTrigger");
    if (trigger) trigger.hidden = !visible;
    if (!visible) closePanel();
}

function buildAdminBar() {
    const main = document.querySelector(".main-content");
    if (!main || document.getElementById("adminNotificationBar")) return;
    const bar = document.createElement("section");
    bar.id = "adminNotificationBar";
    bar.className = "admin-notification-bar";
    bar.innerHTML = `
        <div>
            <h2>${t("adminTitle")}</h2>
            <p>${t("adminHint")}</p>
        </div>
        <button id="adminNotificationTrigger" class="admin-notification-trigger" type="button" aria-label="${t("open")}">
            <span class="material-symbols-outlined">notifications</span>
            <span>${t("notifications")}</span>
            <span id="adminNotificationCount" class="admin-notification-count">0</span>
        </button>
    `;
    main.insertBefore(bar, main.firstElementChild);
    document.getElementById("adminNotificationTrigger").addEventListener("click", togglePanel);
}

function buildLayout() {
    addStylesheet();
    buildPanel();
    if (isAdminPage()) buildAdminBar();
    else buildUserTrigger();
    document.addEventListener("click", (event) => {
        const panel = document.getElementById("notificationPanel");
        if (!panel?.classList.contains("open")) return;
        if (panel.contains(event.target)) return;
        if (event.target.closest("#siteNotificationTrigger, #adminNotificationTrigger")) return;
        closePanel();
    });
}

function updateLanguage() {
    const title = document.getElementById("notificationPanelTitle");
    const markAll = document.getElementById("markAllNotificationsRead");
    const close = document.getElementById("closeNotificationPanel");
    const siteTrigger = document.getElementById("siteNotificationTrigger");
    const siteLabel = siteTrigger?.querySelector(".nav-text");
    const adminBar = document.getElementById("adminNotificationBar");
    if (title) title.textContent = t("notifications");
    if (markAll) markAll.textContent = t("markAllRead");
    if (close) close.setAttribute("aria-label", t("close"));
    if (siteTrigger) siteTrigger.setAttribute("aria-label", t("open"));
    if (siteLabel) siteLabel.textContent = t("bell");
    if (adminBar) {
        const heading = adminBar.querySelector("h2");
        const hint = adminBar.querySelector("p");
        const label = adminBar.querySelector("#adminNotificationTrigger span:not(.material-symbols-outlined):not(.admin-notification-count)");
        if (heading) heading.textContent = t("adminTitle");
        if (hint) hint.textContent = t("adminHint");
        if (label) label.textContent = t("notifications");
    }
}

function togglePanel() {
    const panel = document.getElementById("notificationPanel");
    panel?.classList.toggle("open");
}

function closePanel() {
    document.getElementById("notificationPanel")?.classList.remove("open");
}

function updateCount() {
    const unread = state.notifications.filter((notification) => !notification.read).length;
    const targets = [
        document.getElementById("siteNotificationCount"),
        document.getElementById("adminNotificationCount")
    ];
    targets.forEach((target) => {
        if (!target) return;
        target.textContent = unread > 99 ? "99+" : String(unread);
        target.classList.toggle("active", unread > 0);
    });
}

function renderNotification(notification) {
    const item = document.createElement("article");
    item.className = `notification-item ${notification.read ? "" : "unread"}`.trim();
    const title = `<strong>${safeText(notification.title)}</strong>`;
    const body = `<p>${safeText(notification.body)}</p>`;
    const titleHtml = notification.link
        ? `<a class="notification-link notification-main-link" href="${safeText(notification.link)}">${title}</a>`
        : title;
    const bodyHtml = notification.link
        ? `<a class="notification-link notification-main-link" href="${safeText(notification.link)}">${body}</a>`
        : body;
    item.innerHTML = `
        <span class="notification-icon">
            <span class="material-symbols-outlined">${notificationIcon(notification.type)}</span>
        </span>
        <div class="notification-content">
            <div class="notification-title-row">
                ${titleHtml}
                <div class="notification-actions">
                    ${notification.read ? "" : `<span class="notification-unread-label">${t("unread")}</span>`}
                    ${notification.read ? "" : `<button class="notification-read-btn" type="button" data-read-id="${safeText(notification.id)}">${t("markRead")}</button>`}
                    <button class="notification-delete-btn" type="button" data-delete-id="${safeText(notification.id)}" title="${t("delete")}" aria-label="${t("delete")}">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
            ${bodyHtml}
            <div class="notification-meta">
                <span>${safeText(formatTime(notification))}</span>
            </div>
        </div>
    `;
    item.querySelectorAll(".notification-main-link").forEach((link) => {
        link.addEventListener("click", () => markRead(notification.id, false));
    });
    const readButton = item.querySelector("[data-read-id]");
    if (readButton) {
        readButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            markRead(notification.id);
        });
    }
    const deleteButton = item.querySelector("[data-delete-id]");
    if (deleteButton) {
        deleteButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            deleteNotification(notification.id);
        });
    }
    return item;
}

function renderNotifications() {
    updateLanguage();
    updateCount();
    const list = document.getElementById("notificationList");
    if (!list) return;
    list.innerHTML = "";
    list.classList.toggle("has-overflow-hint", state.notifications.length > 3);
    if (!state.currentTargetId) {
        list.classList.remove("has-overflow-hint");
        list.innerHTML = `<div class="notification-empty">${t("noNotifications")}</div>`;
        return;
    }
    if (!state.notifications.length) {
        list.classList.remove("has-overflow-hint");
        list.innerHTML = `<div class="notification-empty">${t("noNotifications")}</div>`;
        return;
    }
    state.notifications.forEach((notification) => list.appendChild(renderNotification(notification)));
}

async function markRead(id, rerender = true) {
    if (!id) return;
    await updateDoc(doc(db, "Notifications", id), {
        read: true,
        readAt: new Date().toISOString()
    });
    if (rerender) {
        const item = state.notifications.find((notification) => notification.id === id);
        if (item) item.read = true;
        renderNotifications();
    }
}

async function markAllRead() {
    const unread = state.notifications.filter((notification) => !notification.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    const readAt = new Date().toISOString();
    unread.forEach((notification) => {
        batch.update(doc(db, "Notifications", notification.id), { read: true, readAt });
        notification.read = true;
    });
    await batch.commit();
    renderNotifications();
}

async function deleteNotification(id) {
    if (!id) return;
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteDoc(doc(db, "Notifications", id));
    state.notifications = state.notifications.filter((notification) => notification.id !== id);
    renderNotifications();
}

function stopListening() {
    if (state.unsubscribe) state.unsubscribe();
    state.unsubscribe = null;
    state.currentTargetId = "";
    state.currentTargetType = "";
    state.initializedSnapshot = false;
    state.notifications = [];
    renderNotifications();
}

function startListening(targetId, targetType) {
    if (!targetId) return stopListening();
    if (state.currentTargetId === targetId && state.currentTargetType === targetType) return;
    stopListening();
    state.currentTargetId = targetId;
    state.currentTargetType = targetType;
    const notificationsQuery = query(collection(db, "Notifications"), where("userId", "==", targetId));
    state.unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const previousIds = new Set(state.notifications.map((notification) => notification.id));
        const nextNotifications = [];
        const newUnread = [];
        snapshot.forEach((docSnap) => {
            const notification = { id: docSnap.id, ...docSnap.data() };
            if (notification.targetType !== targetType) return;
            nextNotifications.push(notification);
            if (!state.initializedSnapshot && notification.read === false) return;
            if (state.initializedSnapshot && !previousIds.has(notification.id) && !notification.read) {
                newUnread.push(notification);
            }
        });
        nextNotifications.sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
        state.notifications = nextNotifications;
        renderNotifications();
        if (state.initializedSnapshot) newUnread.slice(0, 3).forEach(showToast);
        state.initializedSnapshot = true;
    }, (error) => {
        console.error("Notification listener failed:", error);
    });
}

async function createNotification(payload) {
    if (!payload?.userId) return null;
    const createdAtMs = Date.now();
    return addDoc(collection(db, "Notifications"), {
        userId: String(payload.userId),
        targetType: payload.targetType || (payload.userId === "admin" ? "admin" : "user"),
        title: payload.title || "",
        body: payload.body || "",
        type: payload.type || "info",
        link: payload.link || "",
        sourceCollection: payload.sourceCollection || "",
        sourceId: payload.sourceId || "",
        actorName: payload.actorName || "",
        read: false,
        createdAt: new Date(createdAtMs).toISOString(),
        createdAtMs,
        meta: payload.meta || {}
    });
}

window.SalonNotifications = {
    create: createNotification,
    admin: (payload) => createNotification({ ...payload, userId: "admin", targetType: "admin" }),
    user: (userId, payload) => createNotification({ ...payload, userId, targetType: "user" }),
    markAllRead
};

function init() {
    buildLayout();
    onAuthStateChanged(auth, (user) => {
        if (isAdminPage()) {
            if (user?.email === ADMIN_EMAIL) startListening("admin", "admin");
            else stopListening();
            return;
        }
        if (user?.uid) {
            setUserTriggerVisible(true);
            startListening(user.uid, "user");
        } else {
            setUserTriggerVisible(false);
            stopListening();
        }
    });
    window.addEventListener("storage", (event) => {
        if (event.key === "salonLang") renderNotifications();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
