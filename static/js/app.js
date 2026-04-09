/**
 * Mileage Tracker — Frontend Application (v4)
 *
 * v4 changes:
 * - Fixed iOS standalone white-screen after Excel/CSV download
 * - Fixed reliability of PIN login (verify session tolerance)
 * - Mobile-first UX improvements
 * - Removed leftover v1/v2 code comments
 *
 * Features:
 * - PIN-based login/register
 * - All API calls send X-User-Id header
 * - "Include return trip" checkbox with live preview
 * - Home branch setting with auto-fill
 * - Swap branches button
 * - Keyboard shortcuts (Ctrl+Enter to submit)
 */

(function () {
    "use strict";

    // ========================================================================
    // Constants
    // ========================================================================
    const MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];

    const STORAGE_KEY_USER = "mileage_user_id";
    const STORAGE_KEY_NAME = "mileage_display_name";

    // Detect iOS standalone mode (saved to homescreen)
    const IS_IOS_STANDALONE =
        ("standalone" in window.navigator && window.navigator.standalone) ||
        window.matchMedia("(display-mode: standalone)").matches;

    // ========================================================================
    // State
    // ========================================================================
    let state = {
        userId: null,
        displayName: "",
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        branches: [],
        entries: [],
        summary: { total_entries: 0, total_miles: 0, total_reimbursement: 0 },
        editingId: null,
        filterDay: "",
        homeBranch: "",
        currentRoutes: [],
    };

    // ========================================================================
    // DOM References
    // ========================================================================
    const $ = (sel) => document.querySelector(sel);

    let dom = {};

    function cacheDom() {
        dom = {
            // Auth
            authScreen: $("#auth-screen"),
            appScreen: $("#app-screen"),
            authLoginForm: $("#auth-login-form"),
            authRegisterForm: $("#auth-register-form"),
            authShowRegister: $("#auth-show-register"),
            authShowLogin: $("#auth-show-login"),
            authLoginPin: $("#auth-login-pin"),
            authRegPin: $("#auth-reg-pin"),
            authRegName: $("#auth-reg-name"),
            authLoginError: $("#auth-login-error"),
            authRegError: $("#auth-reg-error"),
            // User badge / logout
            userBadge: $("#user-badge"),
            userName: $("#user-name"),
            btnLogout: $("#btn-logout"),
            // Settings
            homeBranch: $("#home-branch"),
            settingHint: $("#setting-hint"),
            // Month
            selectMonth: $("#select-month"),
            selectYear: $("#select-year"),
            btnPrev: $("#btn-prev-month"),
            btnNext: $("#btn-next-month"),
            // Summary
            statEntries: $("#stat-entries"),
            statMiles: $("#stat-miles"),
            statReimb: $("#stat-reimb"),
            // Form
            form: $("#entry-form"),
            formTitle: $("#form-title"),
            btnCancel: $("#btn-cancel-edit"),
            editId: $("#edit-id"),
            entryDay: $("#entry-day"),
            entryOrigin: $("#entry-origin"),
            entryDest: $("#entry-destination"),
            entryRoute: $("#entry-route"),
            entryPurpose: $("#entry-purpose"),
            entryNotes: $("#entry-notes"),
            previewMiles: $("#preview-miles"),
            previewReimb: $("#preview-reimb"),
            btnSubmit: $("#btn-submit"),
            btnSwap: $("#btn-swap"),
            // Return trip
            returnTripRow: $("#return-trip-row"),
            includeReturn: $("#include-return"),
            returnInfo: $("#return-info"),
            // Table
            tbody: $("#entries-tbody"),
            tableTotalMiles: $("#table-total-miles"),
            tableTotalReimb: $("#table-total-reimb"),
            emptyState: $("#empty-state"),
            tableWrapper: $(".table-wrapper"),
            filterDay: $("#filter-day"),
            btnExportCsv: $("#btn-export-csv"),
            btnExportExcel: $("#btn-export-excel"),
            btnReset: $("#btn-reset-month"),
            // Reference
            toggleRef: $("#toggle-mileage-ref"),
            refBody: $("#mileage-ref-body"),
            refTbody: $("#ref-tbody"),
            // Toast & Modal
            toastContainer: $("#toast-container"),
            modalOverlay: $("#modal-overlay"),
            modalTitle: $("#modal-title"),
            modalMessage: $("#modal-message"),
            modalCancel: $("#modal-cancel"),
            modalConfirm: $("#modal-confirm"),
        };
    }

    // ========================================================================
    // API Helpers
    // ========================================================================
    async function api(url, options = {}) {
        try {
            const headers = {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            };
            if (state.userId) {
                headers["X-User-Id"] = state.userId;
            }
            const res = await fetch(url, { ...options, headers });

            // For file downloads, return the response directly
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("text/csv") || ct.includes("spreadsheetml")) {
                return res;
            }

            const data = await res.json();
            if (!res.ok) {
                const msg = data.errors
                    ? data.errors.join(", ")
                    : data.error || "Request failed";
                throw new Error(msg);
            }
            return data;
        } catch (err) {
            toast(err.message, "error");
            throw err;
        }
    }

    // ========================================================================
    // Authentication
    // ========================================================================
    function loadStoredSession() {
        state.userId = localStorage.getItem(STORAGE_KEY_USER) || null;
        state.displayName = localStorage.getItem(STORAGE_KEY_NAME) || "";
    }

    function saveSession(userId, displayName) {
        state.userId = userId;
        state.displayName = displayName;
        localStorage.setItem(STORAGE_KEY_USER, userId);
        localStorage.setItem(STORAGE_KEY_NAME, displayName);
    }

    function clearSession() {
        state.userId = null;
        state.displayName = "";
        localStorage.removeItem(STORAGE_KEY_USER);
        localStorage.removeItem(STORAGE_KEY_NAME);
        localStorage.removeItem("mileage_home_branch");
    }

    /**
     * Verify the stored session with the server.
     * Returns { valid: boolean, userCount: number }.
     * userCount tells us if ANY users exist (used to decide login vs register form).
     */
    async function verifySession() {
        if (!state.userId) {
            // No stored session — check if any users exist at all
            try {
                const res = await fetch("/api/auth/status");
                const data = await res.json();
                return { valid: false, userCount: data.user_count || 0 };
            } catch {
                return { valid: false, userCount: 0 };
            }
        }
        try {
            const res = await fetch("/api/auth/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: state.userId }),
            });
            const data = await res.json();
            if (data.valid) {
                state.displayName = data.display_name;
                localStorage.setItem(STORAGE_KEY_NAME, data.display_name);
                return { valid: true, userCount: data.user_count || 0 };
            }
            return { valid: false, userCount: data.user_count || 0 };
        } catch {
            // Network error — allow offline access if we have a stored id
            return { valid: !!state.userId, userCount: 1 };
        }
    }

    /**
     * Show the auth screen.
     * @param {boolean} showRegister - If true, show the register form instead of login.
     */
    function showAuthScreen(showRegister) {
        dom.authScreen.style.display = "";
        dom.appScreen.style.display = "none";

        // Decide which form to show
        const loginSection = document.getElementById("auth-login-section");
        const registerSection = document.getElementById("auth-register-section");

        if (showRegister) {
            loginSection.style.display = "none";
            registerSection.style.display = "";
        } else {
            loginSection.style.display = "";
            registerSection.style.display = "none";
        }
    }

    function showAppScreen() {
        dom.authScreen.style.display = "none";
        dom.appScreen.style.display = "";
        dom.userName.textContent = state.displayName;
        dom.userBadge.style.display = "";
    }

    async function handleLogin(e) {
        e.preventDefault();
        dom.authLoginError.textContent = "";
        const pin = dom.authLoginPin.value.trim();

        if (!pin) {
            dom.authLoginError.textContent = "Please enter your PIN.";
            return;
        }

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin }),
            });
            const data = await res.json();
            if (!res.ok) {
                dom.authLoginError.textContent =
                    data.error || "Login failed. Please try again.";
                return;
            }
            saveSession(data.user_id, data.display_name);
            showAppScreen();
            await initTracker();
        } catch {
            dom.authLoginError.textContent =
                "Network error. Please try again.";
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        dom.authRegError.textContent = "";
        const pin = dom.authRegPin.value.trim();
        const name = dom.authRegName.value.trim();

        if (!name) {
            dom.authRegError.textContent = "Please enter your name.";
            return;
        }
        if (!pin || !/^\d{4,8}$/.test(pin)) {
            dom.authRegError.textContent = "PIN must be 4–8 digits.";
            return;
        }

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin, display_name: name }),
            });
            const data = await res.json();
            if (!res.ok) {
                dom.authRegError.textContent =
                    data.error || "Registration failed.";
                return;
            }
            saveSession(data.user_id, data.display_name);
            showAppScreen();
            await initTracker();
        } catch {
            dom.authRegError.textContent =
                "Network error. Please try again.";
        }
    }

    function handleLogout() {
        showConfirm(
            "Sign Out",
            "Are you sure you want to sign out? You can log back in with your PIN.",
            () => {
                clearSession();
                showAuthScreen(false);
                dom.authLoginPin.value = "";
                dom.authRegPin.value = "";
                dom.authRegName.value = "";
                dom.authLoginError.textContent = "";
                dom.authRegError.textContent = "";
            }
        );
    }

    // ========================================================================
    // Home Branch (localStorage)
    // ========================================================================
    function loadHomeBranch() {
        state.homeBranch = localStorage.getItem("mileage_home_branch") || "";
    }

    function saveHomeBranch(branch) {
        state.homeBranch = branch;
        if (branch) {
            localStorage.setItem("mileage_home_branch", branch);
        } else {
            localStorage.removeItem("mileage_home_branch");
        }
        updateSettingHint();
    }

    function updateSettingHint() {
        if (dom.settingHint) {
            dom.settingHint.style.display = state.homeBranch ? "none" : "";
        }
    }

    // ========================================================================
    // Init — Auth Gate
    // ========================================================================
    async function init() {
        cacheDom();
        bindAuthEvents();
        loadStoredSession();

        const result = await verifySession();
        if (result.valid) {
            showAppScreen();
            await initTracker();
        } else {
            clearSession();
            // If there are NO users in the DB, show the register form
            // instead of the login form (avoids confusing 'Welcome Back'
            // when no one has ever registered).
            showAuthScreen(/* showRegister */ result.userCount === 0);
        }
    }

    // ========================================================================
    // Init — Tracker (after auth)
    // ========================================================================
    async function initTracker() {
        loadHomeBranch();
        populateMonthYear();
        populateDays();
        await loadBranches();
        await loadEntries();
        await loadMileageRef();
        bindTrackerEvents();
        updateSettingHint();
    }

    function populateMonthYear() {
        dom.selectMonth.innerHTML = MONTHS.map((m, i) =>
            `<option value="${i + 1}" ${i + 1 === state.month ? "selected" : ""}>${m}</option>`
        ).join("");

        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);
        dom.selectYear.innerHTML = years.map(y =>
            `<option value="${y}" ${y === state.year ? "selected" : ""}>${y}</option>`
        ).join("");
    }

    function populateDays() {
        const daysInMonth = new Date(state.year, state.month, 0).getDate();
        const today = new Date();
        const defaultDay =
            state.year === today.getFullYear() &&
            state.month === today.getMonth() + 1
                ? today.getDate()
                : 1;

        dom.entryDay.innerHTML = "";
        for (let d = 1; d <= daysInMonth; d++) {
            const opt = document.createElement("option");
            opt.value = d;
            opt.textContent = d;
            if (d === defaultDay) opt.selected = true;
            dom.entryDay.appendChild(opt);
        }
    }

    async function loadBranches() {
        state.branches = await api("/api/branches");
        const makeBranchOptions = (selected = "") =>
            `<option value="">Select branch…</option>` +
            state.branches
                .map(
                    (b) =>
                        `<option value="${b}" ${b === selected ? "selected" : ""}>${b}</option>`
                )
                .join("");

        dom.entryOrigin.innerHTML = makeBranchOptions(state.homeBranch);
        dom.entryDest.innerHTML = makeBranchOptions();

        dom.homeBranch.innerHTML =
            `<option value="">Not set</option>` +
            state.branches
                .map(
                    (b) =>
                        `<option value="${b}" ${b === state.homeBranch ? "selected" : ""}>${b}</option>`
                )
                .join("");
    }

    // ========================================================================
    // Entries
    // ========================================================================
    async function loadEntries() {
        const data = await api(
            `/api/entries?year=${state.year}&month=${state.month}`
        );
        state.entries = data.entries;
        state.summary = data.summary;
        updateSummary();
        renderTable();
        updateFilterDays();
    }

    function updateSummary() {
        animateValue(dom.statEntries, state.summary.total_entries, false);
        animateValue(dom.statMiles, state.summary.total_miles, true);
        dom.statReimb.textContent = `$${state.summary.total_reimbursement.toFixed(2)}`;
        dom.tableTotalMiles.textContent = state.summary.total_miles.toFixed(2);
        dom.tableTotalReimb.textContent = `$${state.summary.total_reimbursement.toFixed(2)}`;
    }

    function animateValue(el, target, decimals) {
        const formatted = decimals ? target.toFixed(2) : String(target);
        if (el.textContent !== formatted) {
            el.textContent = formatted;
            el.classList.add("stat-pop");
            setTimeout(() => el.classList.remove("stat-pop"), 350);
        }
    }

    function renderTable() {
        const filtered = state.filterDay
            ? state.entries.filter(
                  (e) => e.day === parseInt(state.filterDay)
              )
            : state.entries;

        if (filtered.length === 0) {
            dom.tableWrapper.style.display = "none";
            dom.emptyState.style.display = "block";
            return;
        }

        dom.tableWrapper.style.display = "";
        dom.emptyState.style.display = "none";

        dom.tbody.innerHTML = filtered
            .map(
                (e) => `
            <tr data-id="${e.id}">
                <td>${e.day}</td>
                <td>${e.origin_branch}</td>
                <td>${e.destination_branch}</td>
                <td>${e.route_name}</td>
                <td class="num">${e.miles.toFixed(2)}</td>
                <td class="num">$${e.reimbursement_amount.toFixed(2)}</td>
                <td class="purpose-cell" title="${escHtml(e.business_purpose)}">${truncate(e.business_purpose, 30)}</td>
                <td class="actions-cell">
                    <button class="btn-row-action edit" title="Edit" data-action="edit" data-id="${e.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="btn-row-action duplicate" title="Duplicate" data-action="duplicate" data-id="${e.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                    <button class="btn-row-action delete" title="Delete" data-action="delete" data-id="${e.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                </td>
            </tr>`
            )
            .join("");
    }

    function updateFilterDays() {
        const days = [
            ...new Set(state.entries.map((e) => e.day)),
        ].sort((a, b) => a - b);
        dom.filterDay.innerHTML =
            `<option value="">All days</option>` +
            days
                .map(
                    (d) =>
                        `<option value="${d}" ${d == state.filterDay ? "selected" : ""}>Day ${d}</option>`
                )
                .join("");
    }

    // ========================================================================
    // Form — Route Loading
    // ========================================================================
    async function loadRoutes() {
        const origin = dom.entryOrigin.value;
        const dest = dom.entryDest.value;

        dom.entryRoute.innerHTML = `<option value="">Select route…</option>`;
        dom.entryRoute.disabled = true;
        dom.previewMiles.textContent = "—";
        dom.previewReimb.textContent = "—";
        state.currentRoutes = [];
        updateReturnTripInfo();

        if (!origin || !dest || origin === dest) return;

        const routes = await api(
            `/api/routes?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`
        );
        state.currentRoutes = routes;

        if (routes.length === 0) {
            dom.entryRoute.innerHTML = `<option value="">No routes available</option>`;
            return;
        }

        dom.entryRoute.disabled = false;
        if (routes.length === 1) {
            dom.entryRoute.innerHTML = routes
                .map(
                    (r) =>
                        `<option value="${r.route}" data-miles="${r.miles}">${r.route} — ${r.miles} mi</option>`
                )
                .join("");
            updatePreview(routes[0]);
        } else {
            dom.entryRoute.innerHTML =
                `<option value="">Choose route…</option>` +
                routes
                    .map(
                        (r) =>
                            `<option value="${r.route}" data-miles="${r.miles}">${r.route} — ${r.miles} mi</option>`
                    )
                    .join("");
        }
    }

    function updatePreview(routeData) {
        if (!routeData) {
            dom.previewMiles.textContent = "—";
            dom.previewReimb.textContent = "—";
        } else {
            dom.previewMiles.textContent = routeData.miles.toFixed(2);
            dom.previewReimb.textContent = `$${(routeData.miles * 0.725).toFixed(2)}`;
        }
        updateReturnTripInfo();
    }

    // ========================================================================
    // Form — Return Trip
    // ========================================================================
    async function updateReturnTripInfo() {
        const origin = dom.entryOrigin.value;
        const dest = dom.entryDest.value;
        const routeName = dom.entryRoute.value;

        if (state.editingId) {
            dom.returnTripRow.style.display = "none";
            return;
        }
        dom.returnTripRow.style.display = "";

        if (!origin || !dest || !routeName || origin === dest) {
            dom.returnInfo.textContent = "";
            dom.returnInfo.classList.remove("return-valid", "return-invalid");
            return;
        }

        try {
            const returnRoutes = await api(
                `/api/routes?origin=${encodeURIComponent(dest)}&destination=${encodeURIComponent(origin)}`
            );

            if (returnRoutes.length === 0) {
                dom.returnInfo.textContent = "⚠ No return route available";
                dom.returnInfo.classList.add("return-invalid");
                dom.returnInfo.classList.remove("return-valid");
                dom.includeReturn.disabled = true;
                dom.includeReturn.checked = false;
                return;
            }

            const matched =
                returnRoutes.find((r) => r.route === routeName) ||
                returnRoutes[0];

            dom.returnInfo.textContent =
                `↩ ${dest} → ${origin} via ${matched.route} (${matched.miles} mi, $${(matched.miles * 0.725).toFixed(2)})`;
            dom.returnInfo.classList.add("return-valid");
            dom.returnInfo.classList.remove("return-invalid");
            dom.includeReturn.disabled = false;
        } catch {
            dom.returnInfo.textContent = "";
            dom.includeReturn.disabled = true;
        }
    }

    // ========================================================================
    // Form — Swap Branches
    // ========================================================================
    function swapBranches() {
        const origin = dom.entryOrigin.value;
        const dest = dom.entryDest.value;
        dom.entryOrigin.value = dest;
        dom.entryDest.value = origin;
        loadRoutes();
    }

    // ========================================================================
    // Form — Submit / Reset
    // ========================================================================
    function resetForm() {
        dom.form.reset();
        dom.editId.value = "";
        state.editingId = null;
        dom.formTitle.textContent = "New Entry";
        dom.btnCancel.style.display = "none";
        dom.btnSubmit.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Save Entry`;
        dom.entryRoute.innerHTML = `<option value="">Select route…</option>`;
        dom.entryRoute.disabled = true;
        dom.previewMiles.textContent = "—";
        dom.previewReimb.textContent = "—";
        dom.includeReturn.checked = false;
        dom.returnInfo.textContent = "";
        dom.returnTripRow.style.display = "";

        populateDays();

        if (state.homeBranch) {
            dom.entryOrigin.value = state.homeBranch;
        }
    }

    function populateFormForEdit(entry) {
        state.editingId = entry.id;
        dom.editId.value = entry.id;
        dom.formTitle.textContent = "Edit Entry";
        dom.btnCancel.style.display = "";
        dom.btnSubmit.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Update Entry`;
        dom.returnTripRow.style.display = "none";

        dom.entryDay.value = entry.day;
        dom.entryOrigin.value = entry.origin_branch;
        dom.entryDest.value = entry.destination_branch;
        dom.entryPurpose.value = entry.business_purpose || "";
        dom.entryNotes.value = entry.notes || "";

        loadRoutes().then(() => {
            dom.entryRoute.value = entry.route_name;
            updatePreview({ miles: entry.miles });
        });

        dom.form.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function handleSubmit(e) {
        e.preventDefault();

        const payload = {
            year: state.year,
            month: state.month,
            day: parseInt(dom.entryDay.value),
            origin_branch: dom.entryOrigin.value,
            destination_branch: dom.entryDest.value,
            route_name: dom.entryRoute.value,
            business_purpose: dom.entryPurpose.value,
            notes: dom.entryNotes.value,
        };

        if (
            !payload.origin_branch ||
            !payload.destination_branch ||
            !payload.route_name
        ) {
            toast("Please fill in all required fields", "error");
            return;
        }

        if (!state.editingId && dom.includeReturn.checked) {
            payload.include_return = true;
        }

        try {
            if (state.editingId) {
                await api(`/api/entries/${state.editingId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                toast("Entry updated", "success");
            } else {
                const result = await api("/api/entries", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                const count = result.count || 1;
                toast(
                    count > 1
                        ? `${count} entries saved (incl. return trip)`
                        : "Entry saved",
                    "success"
                );
            }
            resetForm();
            await loadEntries();
        } catch {
            // Error already shown by api()
        }
    }

    // ========================================================================
    // Table Actions
    // ========================================================================
    async function handleTableAction(action, id) {
        const entry = state.entries.find((e) => e.id === id);
        if (!entry) return;

        if (action === "edit") {
            populateFormForEdit(entry);
        } else if (action === "duplicate") {
            const payload = {
                year: state.year,
                month: state.month,
                day: entry.day,
                origin_branch: entry.origin_branch,
                destination_branch: entry.destination_branch,
                route_name: entry.route_name,
                business_purpose: entry.business_purpose,
                notes: entry.notes,
            };
            try {
                await api("/api/entries", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast("Entry duplicated", "success");
                await loadEntries();
            } catch {
                /* handled by api() */
            }
        } else if (action === "delete") {
            showConfirm(
                "Delete Entry",
                `Delete the ${entry.origin_branch} → ${entry.destination_branch} entry for day ${entry.day}?`,
                async () => {
                    try {
                        await api(`/api/entries/${id}`, {
                            method: "DELETE",
                        });
                        toast("Entry deleted", "success");
                        await loadEntries();
                    } catch {
                        /* handled by api() */
                    }
                }
            );
        }
    }

    function handleResetMonth() {
        const monthName = MONTHS[state.month - 1];
        showConfirm(
            "Reset Month",
            `This will permanently delete ALL entries for ${monthName} ${state.year}. This cannot be undone.`,
            async () => {
                try {
                    const result = await api("/api/entries/clear", {
                        method: "POST",
                        body: JSON.stringify({
                            year: state.year,
                            month: state.month,
                        }),
                    });
                    toast(
                        `Cleared ${result.deleted_count} entries for ${monthName}`,
                        "success"
                    );
                    resetForm();
                    await loadEntries();
                } catch {
                    /* handled by api() */
                }
            }
        );
    }

    // ========================================================================
    // Mileage Reference
    // ========================================================================
    async function loadMileageRef() {
        const table = await api("/api/mileage-table");
        dom.refTbody.innerHTML = table
            .map(
                (r) => `
            <tr>
                <td>${r.origin}</td>
                <td>${r.destination}</td>
                <td>${r.route}</td>
                <td class="num">${r.miles.toFixed(2)}</td>
                <td class="num">$${r.reimbursement.toFixed(2)}</td>
            </tr>`
            )
            .join("");
    }

    // ========================================================================
    // Toast
    // ========================================================================
    function toast(message, type = "info") {
        const el = document.createElement("div");
        el.className = `toast ${type}`;
        el.textContent = message;
        dom.toastContainer.appendChild(el);
        setTimeout(() => {
            el.classList.add("fade-out");
            el.addEventListener("animationend", () => el.remove());
        }, 2500);
    }

    // ========================================================================
    // Confirm Modal
    // ========================================================================
    let confirmCallback = null;

    function showConfirm(title, message, onConfirm) {
        dom.modalTitle.textContent = title;
        dom.modalMessage.textContent = message;
        confirmCallback = onConfirm;
        dom.modalOverlay.style.display = "";
    }

    function hideConfirm() {
        dom.modalOverlay.style.display = "none";
        confirmCallback = null;
    }

    // ========================================================================
    // Export — iOS-safe download
    // ========================================================================

    /**
     * Download a file via fetch + blob.
     *
     * On iOS standalone web apps (saved to homescreen), using
     * `<a>.click()` or `URL.createObjectURL()` can navigate the
     * WebKit view away from the app and show a white screen.
     *
     * Fix: On iOS standalone, we open the blob URL in a new window,
     * which keeps the main app intact. On all other platforms we use
     * the standard invisible-anchor approach.
     */
    async function downloadExport(url) {
        try {
            const res = await fetch(url, {
                headers: { "X-User-Id": state.userId || "" },
            });

            if (!res.ok) throw new Error("Export failed");

            const disposition = res.headers.get("content-disposition") || "";
            const match = disposition.match(/filename=(.+)/);
            const filename = match ? match[1].replace(/['"]/g, "") : "export";
            const blob = await res.blob();

            if (IS_IOS_STANDALONE) {
                // iOS standalone: use a temporary iframe or open in a new
                // tab. Opening a new window works best to avoid hijacking
                // the standalone app view.
                const blobUrl = URL.createObjectURL(blob);

                // Use a hidden iframe to trigger the download without
                // navigating the main window.
                const iframe = document.createElement("iframe");
                iframe.style.display = "none";
                document.body.appendChild(iframe);

                // Write a download link into the iframe and click it
                iframe.contentDocument.open();
                iframe.contentDocument.write(`
                    <html><body>
                    <a id="dl" download="${escHtml(filename)}" href="${blobUrl}">download</a>
                    <script>document.getElementById('dl').click();</script>
                    </body></html>
                `);
                iframe.contentDocument.close();

                // Clean up after a short delay
                setTimeout(() => {
                    URL.revokeObjectURL(blobUrl);
                    iframe.remove();
                }, 5000);
            } else {
                // Standard approach for desktop and Android
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(blobUrl);
            }
        } catch {
            toast("Export failed", "error");
        }
    }

    // ========================================================================
    // Event Bindings — Auth
    // ========================================================================
    let authBound = false;

    function bindAuthEvents() {
        if (authBound) return;
        authBound = true;

        dom.authLoginForm.addEventListener("submit", handleLogin);
        dom.authRegisterForm.addEventListener("submit", handleRegister);

        dom.authShowRegister.addEventListener("click", (e) => {
            e.preventDefault();
            dom.authLoginForm.parentElement.style.display = "none";
            dom.authRegisterForm.parentElement.style.display = "";
        });

        dom.authShowLogin.addEventListener("click", (e) => {
            e.preventDefault();
            dom.authRegisterForm.parentElement.style.display = "none";
            dom.authLoginForm.parentElement.style.display = "";
        });
    }

    // ========================================================================
    // Event Bindings — Tracker
    // ========================================================================
    let trackerBound = false;

    function bindTrackerEvents() {
        if (trackerBound) return;
        trackerBound = true;

        // --- Logout ---
        dom.btnLogout.addEventListener("click", handleLogout);

        // --- Home branch ---
        dom.homeBranch.addEventListener("change", () => {
            saveHomeBranch(dom.homeBranch.value);
            if (!state.editingId && state.homeBranch) {
                dom.entryOrigin.value = state.homeBranch;
                loadRoutes();
            }
        });

        // --- Month/Year ---
        dom.selectMonth.addEventListener("change", () => {
            state.month = parseInt(dom.selectMonth.value);
            populateDays();
            resetForm();
            loadEntries();
        });

        dom.selectYear.addEventListener("change", () => {
            state.year = parseInt(dom.selectYear.value);
            populateDays();
            resetForm();
            loadEntries();
        });

        dom.btnPrev.addEventListener("click", () => {
            state.month--;
            if (state.month < 1) {
                state.month = 12;
                state.year--;
            }
            populateMonthYear();
            populateDays();
            resetForm();
            loadEntries();
        });

        dom.btnNext.addEventListener("click", () => {
            state.month++;
            if (state.month > 12) {
                state.month = 1;
                state.year++;
            }
            populateMonthYear();
            populateDays();
            resetForm();
            loadEntries();
        });

        // --- Form fields ---
        dom.entryOrigin.addEventListener("change", loadRoutes);
        dom.entryDest.addEventListener("change", loadRoutes);

        dom.entryRoute.addEventListener("change", () => {
            const selected = dom.entryRoute.selectedOptions[0];
            if (selected && selected.dataset.miles) {
                updatePreview({
                    miles: parseFloat(selected.dataset.miles),
                });
            } else {
                updatePreview(null);
            }
        });

        dom.btnSwap.addEventListener("click", swapBranches);

        // --- Return trip checkbox ---
        dom.includeReturn.addEventListener("change", () => {
            if (dom.includeReturn.checked && !state.editingId) {
                dom.btnSubmit.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Save 2 Entries`;
            } else {
                dom.btnSubmit.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                    Save Entry`;
            }
        });

        // --- Form submit ---
        dom.form.addEventListener("submit", handleSubmit);
        dom.btnCancel.addEventListener("click", resetForm);

        // --- Keyboard shortcut: Ctrl+Enter to submit ---
        dom.form.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                dom.form.requestSubmit();
            }
        });

        // --- Table actions (event delegation) ---
        dom.tbody.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            handleTableAction(btn.dataset.action, parseInt(btn.dataset.id));
        });

        // --- Filter ---
        dom.filterDay.addEventListener("change", () => {
            state.filterDay = dom.filterDay.value;
            renderTable();
        });

        // --- Export ---
        dom.btnExportCsv.addEventListener("click", () => {
            downloadExport(
                `/api/export/csv?year=${state.year}&month=${state.month}`
            );
            toast("CSV downloading…", "success");
        });

        dom.btnExportExcel.addEventListener("click", () => {
            downloadExport(
                `/api/export/excel?year=${state.year}&month=${state.month}`
            );
            toast("Excel downloading…", "success");
        });

        // --- Reset month ---
        dom.btnReset.addEventListener("click", handleResetMonth);

        // --- Reference toggle ---
        dom.toggleRef.addEventListener("click", () => {
            const isOpen = dom.refBody.style.display !== "none";
            dom.refBody.style.display = isOpen ? "none" : "";
            dom.toggleRef
                .querySelector(".chevron")
                .classList.toggle("open", !isOpen);
        });

        // --- Modal ---
        dom.modalCancel.addEventListener("click", hideConfirm);
        dom.modalOverlay.addEventListener("click", (e) => {
            if (e.target === dom.modalOverlay) hideConfirm();
        });
        dom.modalConfirm.addEventListener("click", () => {
            if (confirmCallback) confirmCallback();
            hideConfirm();
        });

        document.addEventListener("keydown", (e) => {
            if (
                e.key === "Escape" &&
                dom.modalOverlay.style.display !== "none"
            ) {
                hideConfirm();
            }
        });
    }

    // ========================================================================
    // Utilities
    // ========================================================================
    function escHtml(str) {
        const el = document.createElement("span");
        el.textContent = str || "";
        return el.innerHTML;
    }

    function truncate(str, len) {
        if (!str) return "";
        return str.length > len ? str.slice(0, len) + "…" : str;
    }

    // ========================================================================
    // Boot
    // ========================================================================
    document.addEventListener("DOMContentLoaded", init);
})();
