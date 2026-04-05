/**
 * Mileage Tracker — Frontend Application
 * Handles all UI interactions, API calls, and state management.
 */

(function () {
    "use strict";

    // ========================================================================
    // State
    // ========================================================================
    const MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];

    let state = {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1, // 1-indexed
        branches: [],
        entries: [],
        summary: { total_entries: 0, total_miles: 0, total_reimbursement: 0 },
        editingId: null,
        filterDay: "",
    };

    // ========================================================================
    // DOM References
    // ========================================================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        selectMonth: $("#select-month"),
        selectYear: $("#select-year"),
        btnPrev: $("#btn-prev-month"),
        btnNext: $("#btn-next-month"),
        statEntries: $("#stat-entries"),
        statMiles: $("#stat-miles"),
        statReimb: $("#stat-reimb"),
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
        tbody: $("#entries-tbody"),
        tableTotalMiles: $("#table-total-miles"),
        tableTotalReimb: $("#table-total-reimb"),
        emptyState: $("#empty-state"),
        tableWrapper: $(".table-wrapper"),
        filterDay: $("#filter-day"),
        btnExportCsv: $("#btn-export-csv"),
        btnExportExcel: $("#btn-export-excel"),
        btnReset: $("#btn-reset-month"),
        toggleRef: $("#toggle-mileage-ref"),
        refBody: $("#mileage-ref-body"),
        refTbody: $("#ref-tbody"),
        toastContainer: $("#toast-container"),
        modalOverlay: $("#modal-overlay"),
        modalTitle: $("#modal-title"),
        modalMessage: $("#modal-message"),
        modalCancel: $("#modal-cancel"),
        modalConfirm: $("#modal-confirm"),
    };

    // ========================================================================
    // API Helpers
    // ========================================================================
    async function api(url, options = {}) {
        try {
            const res = await fetch(url, {
                headers: { "Content-Type": "application/json" },
                ...options,
            });
            const data = await res.json();
            if (!res.ok) {
                const msg = data.errors ? data.errors.join(", ") : data.error || "Request failed";
                throw new Error(msg);
            }
            return data;
        } catch (err) {
            toast(err.message, "error");
            throw err;
        }
    }

    // ========================================================================
    // Init
    // ========================================================================
    async function init() {
        populateMonthYear();
        populateDays();
        await loadBranches();
        await loadEntries();
        await loadMileageRef();
        bindEvents();
    }

    function populateMonthYear() {
        dom.selectMonth.innerHTML = MONTHS.map((m, i) =>
            `<option value="${i + 1}" ${i + 1 === state.month ? "selected" : ""}>${m}</option>`
        ).join("");

        const currentYear = new Date().getFullYear();
        let years = [];
        for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);
        dom.selectYear.innerHTML = years.map(y =>
            `<option value="${y}" ${y === state.year ? "selected" : ""}>${y}</option>`
        ).join("");
    }

    function populateDays() {
        const daysInMonth = new Date(state.year, state.month, 0).getDate();
        const today = new Date();
        const defaultDay = (state.year === today.getFullYear() && state.month === today.getMonth() + 1)
            ? today.getDate() : 1;

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
        const makeBranchOptions = () =>
            `<option value="">Select branch…</option>` +
            state.branches.map(b => `<option value="${b}">${b}</option>`).join("");

        dom.entryOrigin.innerHTML = makeBranchOptions();
        dom.entryDest.innerHTML = makeBranchOptions();
    }

    // ========================================================================
    // Entries
    // ========================================================================
    async function loadEntries() {
        const data = await api(`/api/entries?year=${state.year}&month=${state.month}`);
        state.entries = data.entries;
        state.summary = data.summary;
        updateSummary();
        renderTable();
        updateFilterDays();
    }

    function updateSummary() {
        dom.statEntries.textContent = state.summary.total_entries;
        dom.statMiles.textContent = state.summary.total_miles.toFixed(2);
        dom.statReimb.textContent = `$${state.summary.total_reimbursement.toFixed(2)}`;
        dom.tableTotalMiles.textContent = state.summary.total_miles.toFixed(2);
        dom.tableTotalReimb.textContent = `$${state.summary.total_reimbursement.toFixed(2)}`;
    }

    function renderTable() {
        const filtered = state.filterDay
            ? state.entries.filter(e => e.day === parseInt(state.filterDay))
            : state.entries;

        if (filtered.length === 0) {
            dom.tableWrapper.style.display = "none";
            dom.emptyState.style.display = "block";
            return;
        }

        dom.tableWrapper.style.display = "";
        dom.emptyState.style.display = "none";

        dom.tbody.innerHTML = filtered.map(e => `
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
            </tr>
        `).join("");
    }

    function updateFilterDays() {
        const days = [...new Set(state.entries.map(e => e.day))].sort((a, b) => a - b);
        dom.filterDay.innerHTML = `<option value="">All days</option>` +
            days.map(d => `<option value="${d}" ${d == state.filterDay ? "selected" : ""}>Day ${d}</option>`).join("");
    }

    // ========================================================================
    // Form
    // ========================================================================
    async function loadRoutes() {
        const origin = dom.entryOrigin.value;
        const dest = dom.entryDest.value;

        dom.entryRoute.innerHTML = `<option value="">Select route…</option>`;
        dom.entryRoute.disabled = true;
        dom.previewMiles.textContent = "—";
        dom.previewReimb.textContent = "—";

        if (!origin || !dest || origin === dest) return;

        const routes = await api(`/api/routes?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`);
        if (routes.length === 0) {
            dom.entryRoute.innerHTML = `<option value="">No routes available</option>`;
            return;
        }

        dom.entryRoute.disabled = false;
        if (routes.length === 1) {
            dom.entryRoute.innerHTML = routes.map(r =>
                `<option value="${r.route}" data-miles="${r.miles}">${r.route} — ${r.miles} mi</option>`
            ).join("");
            updatePreview(routes[0]);
        } else {
            dom.entryRoute.innerHTML = `<option value="">Choose route…</option>` +
                routes.map(r =>
                    `<option value="${r.route}" data-miles="${r.miles}">${r.route} — ${r.miles} mi</option>`
                ).join("");
        }
    }

    function updatePreview(routeData) {
        if (!routeData) {
            dom.previewMiles.textContent = "—";
            dom.previewReimb.textContent = "—";
            return;
        }
        dom.previewMiles.textContent = routeData.miles.toFixed(2);
        dom.previewReimb.textContent = `$${(routeData.miles * 0.725).toFixed(2)}`;
    }

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

        // Reset day to today if in current month
        populateDays();
    }

    function populateFormForEdit(entry) {
        state.editingId = entry.id;
        dom.editId.value = entry.id;
        dom.formTitle.textContent = "Edit Entry";
        dom.btnCancel.style.display = "";
        dom.btnSubmit.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Update Entry`;

        dom.entryDay.value = entry.day;
        dom.entryOrigin.value = entry.origin_branch;
        dom.entryDest.value = entry.destination_branch;
        dom.entryPurpose.value = entry.business_purpose || "";
        dom.entryNotes.value = entry.notes || "";

        // Load routes then select the right one
        loadRoutes().then(() => {
            dom.entryRoute.value = entry.route_name;
            updatePreview({ miles: entry.miles });
        });

        // Scroll to form
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

        if (!payload.origin_branch || !payload.destination_branch || !payload.route_name) {
            toast("Please fill in all required fields", "error");
            return;
        }

        try {
            if (state.editingId) {
                await api(`/api/entries/${state.editingId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
                toast("Entry updated", "success");
            } else {
                await api("/api/entries", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast("Entry saved", "success");
            }
            resetForm();
            await loadEntries();
        } catch (err) {
            // Error already shown by api()
        }
    }

    // ========================================================================
    // Actions
    // ========================================================================
    async function handleTableAction(action, id) {
        const entry = state.entries.find(e => e.id === id);
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
                await api("/api/entries", { method: "POST", body: JSON.stringify(payload) });
                toast("Entry duplicated", "success");
                await loadEntries();
            } catch (err) { /* handled */ }
        } else if (action === "delete") {
            showConfirm(
                "Delete Entry",
                `Delete the ${entry.origin_branch} → ${entry.destination_branch} entry for day ${entry.day}?`,
                async () => {
                    try {
                        await api(`/api/entries/${id}`, { method: "DELETE" });
                        toast("Entry deleted", "success");
                        await loadEntries();
                    } catch (err) { /* handled */ }
                }
            );
        }
    }

    function handleResetMonth() {
        const monthName = MONTHS[state.month - 1];
        showConfirm(
            "Reset Month",
            `This will permanently delete ALL entries for ${monthName} ${state.year}. This cannot be undone. Continue?`,
            async () => {
                try {
                    const result = await api("/api/entries/clear", {
                        method: "POST",
                        body: JSON.stringify({ year: state.year, month: state.month }),
                    });
                    toast(`Cleared ${result.deleted_count} entries for ${monthName}`, "success");
                    resetForm();
                    await loadEntries();
                } catch (err) { /* handled */ }
            }
        );
    }

    // ========================================================================
    // Mileage Reference
    // ========================================================================
    async function loadMileageRef() {
        const table = await api("/api/mileage-table");
        dom.refTbody.innerHTML = table.map(r => `
            <tr>
                <td>${r.origin}</td>
                <td>${r.destination}</td>
                <td>${r.route}</td>
                <td class="num">${r.miles.toFixed(2)}</td>
                <td class="num">$${r.reimbursement.toFixed(2)}</td>
            </tr>
        `).join("");
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
    // Export helpers
    // ========================================================================
    function downloadFile(url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // ========================================================================
    // Event Bindings
    // ========================================================================
    function bindEvents() {
        // Month/year change
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
            if (state.month < 1) { state.month = 12; state.year--; }
            populateMonthYear();
            populateDays();
            resetForm();
            loadEntries();
        });

        dom.btnNext.addEventListener("click", () => {
            state.month++;
            if (state.month > 12) { state.month = 1; state.year++; }
            populateMonthYear();
            populateDays();
            resetForm();
            loadEntries();
        });

        // Form fields
        dom.entryOrigin.addEventListener("change", loadRoutes);
        dom.entryDest.addEventListener("change", loadRoutes);

        dom.entryRoute.addEventListener("change", () => {
            const selected = dom.entryRoute.selectedOptions[0];
            if (selected && selected.dataset.miles) {
                updatePreview({ miles: parseFloat(selected.dataset.miles) });
            } else {
                updatePreview(null);
            }
        });

        // Form submit
        dom.form.addEventListener("submit", handleSubmit);
        dom.btnCancel.addEventListener("click", resetForm);

        // Table actions (event delegation)
        dom.tbody.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            handleTableAction(btn.dataset.action, parseInt(btn.dataset.id));
        });

        // Filter
        dom.filterDay.addEventListener("change", () => {
            state.filterDay = dom.filterDay.value;
            renderTable();
        });

        // Export
        dom.btnExportCsv.addEventListener("click", () => {
            downloadFile(`/api/export/csv?year=${state.year}&month=${state.month}`);
            toast("CSV downloaded", "success");
        });

        dom.btnExportExcel.addEventListener("click", () => {
            downloadFile(`/api/export/excel?year=${state.year}&month=${state.month}`);
            toast("Excel downloaded", "success");
        });

        // Reset month
        dom.btnReset.addEventListener("click", handleResetMonth);

        // Reference toggle
        dom.toggleRef.addEventListener("click", () => {
            const isOpen = dom.refBody.style.display !== "none";
            dom.refBody.style.display = isOpen ? "none" : "";
            dom.toggleRef.querySelector(".chevron").classList.toggle("open", !isOpen);
        });

        // Modal
        dom.modalCancel.addEventListener("click", hideConfirm);
        dom.modalOverlay.addEventListener("click", (e) => {
            if (e.target === dom.modalOverlay) hideConfirm();
        });
        dom.modalConfirm.addEventListener("click", () => {
            if (confirmCallback) confirmCallback();
            hideConfirm();
        });

        // Keyboard: Escape closes modal
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && dom.modalOverlay.style.display !== "none") {
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
