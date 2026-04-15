// --- FIREBASE CONFIGURATION ---
// PASTE YOUR CONFIG HERE
const firebaseConfig = {
  apiKey: "AIzaSyDvz8G92ildKIBviJEEUZEvHkFDct4X37U",
  authDomain: "fintrack-boss.firebaseapp.com",
  projectId: "fintrack-boss",
  storageBucket: "fintrack-boss.firebasestorage.app",
  messagingSenderId: "184544234686",
  appId: "1:184544234686:web:7bde34bb59a8accbf522ef",
  measurementId: "G-YWE14EWLZP"
};

let db, auth;
let currentUser = null;

if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    const app = FirebaseSDK.initializeApp(firebaseConfig);
    db = FirebaseSDK.getFirestore(app);
    auth = FirebaseSDK.getAuth(app);

    FirebaseSDK.onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            updateAuthUI(true);
            await loadCloudData();
        } else {
            currentUser = null;
            updateAuthUI(false);
            loadState(); // Fallback to local
        }
    });
}

// --- STATE MANAGEMENT ---
let AppState = {
    monthlyPlans: {},
    goals: [],
    expenses: [],
    loans: [],
    assets: []
};

async function loadState() {
    if (currentUser) {
        await loadCloudData();
    } else {
        const saved = localStorage.getItem('fintrack_state');
        if (saved) {
            AppState = JSON.parse(saved);
        }
        updateUI();
    }
}

async function loadCloudData() {
    if (!currentUser) return;
    const { doc, getDoc } = FirebaseSDK;

    try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
            AppState = userDoc.data();
            updateUI();
        } else {
            // First time user? 
            const localSaved = localStorage.getItem('fintrack_state');
            if (localSaved) {
                if (confirm("Found local data from this browser! Would you like to sync it to your cloud account?")) {
                    AppState = JSON.parse(localSaved);
                    await saveState();
                }
            } else {
                // Totally new user - cloud bucket already initialized as empty
                await saveState();
            }
        }
    } catch (e) {
        console.error("Error loading from cloud:", e);
    }
}

async function saveState() {
    if (currentUser) {
        const { doc, setDoc } = FirebaseSDK;
        try {
            await setDoc(doc(db, "users", currentUser.uid), AppState);
        } catch (e) {
            console.error("Cloud save failed:", e);
        }
    } else {
        localStorage.setItem('fintrack_state', JSON.stringify(AppState));
    }
    updateUI();
}

function updateAuthUI(isLoggedIn) {
    const loggedOutSection = document.getElementById('user-logged-out');
    const loggedInSection = document.getElementById('user-logged-in');

    if (isLoggedIn && currentUser) {
        loggedOutSection.style.display = 'none';
        loggedInSection.style.display = 'block';
        document.getElementById('user-name').textContent = currentUser.displayName;
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('user-photo').src = currentUser.photoURL || 'https://via.placeholder.com/40';
    } else {
        loggedOutSection.style.display = 'block';
        loggedInSection.style.display = 'none';
    }
}

// --- SETUP & NAVIGATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial UI load
    loadState();
    setupNavigation();
    setupForms();
    setupModal();

    // Auth Event Listeners
    const loginBtn = document.getElementById('btn-login');
    const logoutBtn = document.getElementById('btn-logout');

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            if (!auth) {
                alert("Firebase not configured! Please paste your config in main.js first.");
                return;
            }
            const provider = new FirebaseSDK.GoogleAuthProvider();
            try {
                await FirebaseSDK.signInWithPopup(auth, provider);
            } catch (e) {
                console.error("Login failed:", e);
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (auth) {
                await FirebaseSDK.signOut(auth);
                location.reload(); // Refresh to clear private state
            }
        });
    }

    updateUI();
});

window.switchTab = function (tabName) {
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navItems.forEach(nav => nav.classList.remove('active'));
    tabPanes.forEach(tab => tab.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) targetTab.classList.add('active');

    const navItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (navItem) navItem.classList.add('active');

    lucide.createIcons();
};

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active from all
            navItems.forEach(nav => nav.classList.remove('active'));
            tabPanes.forEach(tab => tab.classList.remove('active'));

            // Add active to clicked
            item.classList.add('active');
            const targetTab = document.getElementById(`tab-${item.dataset.tab}`);
            if (targetTab) targetTab.classList.add('active');

            // Reinitialize icons in case new ones were rendered
            lucide.createIcons();
        });
    });
}

function setupForms() {
    // Goal Form
    const goalForm = document.getElementById('goal-form');
    goalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const currentYear = new Date().getFullYear();
        const newGoal = {
            id: Date.now().toString(),
            name: document.getElementById('goal-name').value.trim(),
            targetToday: Number(document.getElementById('goal-target').value),
            creationYear: currentYear,
            inflationRate: Number(document.getElementById('goal-inflation').value) || 6,
            saved: 0,
            monthlyLogs: [],
            countInNetWorth: true
        };
        AppState.goals.push(newGoal);
        saveState();
        goalForm.reset();
        renderGoals();
    });

    // Expense Modal wiring
    const expenseModal = document.getElementById('expense-modal');
    const openExpenseBtn = document.getElementById('open-expense-modal');
    const closeExpenseBtn = document.getElementById('close-expense-modal');

    openExpenseBtn.addEventListener('click', () => {
        document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('expense-amount').value = '';
        document.getElementById('expense-purpose').value = '';
        document.getElementById('expense-reflex').checked = false;
        expenseModal.classList.add('active');
        lucide.createIcons();
    });
    closeExpenseBtn.addEventListener('click', () => expenseModal.classList.remove('active'));
    expenseModal.addEventListener('click', (e) => { if (e.target === expenseModal) expenseModal.classList.remove('active'); });

    // Expense Form submit
    document.getElementById('expense-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const date = document.getElementById('expense-date').value;
        const amount = Number(document.getElementById('expense-amount').value);
        const purpose = document.getElementById('expense-purpose').value.trim();
        const isReflex = document.getElementById('expense-reflex').checked;

        if (!date || !amount || !purpose) {
            alert('Please fill in Date, Amount, and Purpose.');
            return;
        }

        AppState.expenses.push({ id: Date.now().toString(), date, amount, purpose, isReflex });
        AppState.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        saveState();
        expenseModal.classList.remove('active');
    });

    // Planner wiring
    const bucketModal = document.getElementById('bucket-modal');
    document.getElementById('open-bucket-modal').addEventListener('click', () => {
        document.getElementById('bucket-form').reset();
        document.getElementById('edit-bucket-id').value = '';
        const titleEl = document.getElementById('bucket-modal-title');
        if (titleEl) titleEl.textContent = '💰 Add Budget Bucket';
        bucketModal.classList.add('active');
        lucide.createIcons();
    });
    document.getElementById('close-bucket-modal').addEventListener('click', () => bucketModal.classList.remove('active'));
    bucketModal.addEventListener('click', e => { if (e.target === bucketModal) bucketModal.classList.remove('active'); });

    document.getElementById('bucket-form').addEventListener('submit', e => {
        e.preventDefault();
        const editId = document.getElementById('edit-bucket-id').value;
        const name = document.getElementById('bucket-name').value.trim();
        const amount = Number(document.getElementById('bucket-amount').value);
        const category = document.getElementById('bucket-category').value;
        if (!name || !amount) { alert('Please enter a name and amount.'); return; }
        const key = getPlannerKey();
        if (!AppState.monthlyPlans[key]) AppState.monthlyPlans[key] = { income: 0, buckets: [] };

        if (editId) {
            const bucket = AppState.monthlyPlans[key].buckets.find(b => b.id === editId);
            if (bucket) {
                bucket.name = name;
                bucket.amount = amount;
                bucket.category = category;
            }
        } else {
            AppState.monthlyPlans[key].buckets.push({ id: Date.now().toString(), name, amount, category, paid: false });
        }

        saveState();
        renderPlanner();
        bucketModal.classList.remove('active');
    });

    const yearlySelect = document.getElementById('planner-year-select');
    if (yearlySelect) {
        yearlySelect.addEventListener('change', () => {
            renderPlannerYearlySummary();
        });
    }

    const navMonthly = document.getElementById('planner-nav-monthly');
    const navYearly = document.getElementById('planner-nav-yearly');
    const viewMonthly = document.getElementById('planner-monthly-view');
    const viewYearly = document.getElementById('planner-yearly-view');

    if (navMonthly && navYearly && viewMonthly && viewYearly) {
        navMonthly.addEventListener('click', () => {
            navMonthly.style.background = 'var(--primary)';
            navMonthly.style.color = '#000';
            navMonthly.classList.remove('btn-secondary');

            navYearly.style.background = 'transparent';
            navYearly.style.color = 'var(--text-muted)';
            navYearly.classList.add('btn-secondary');

            viewMonthly.style.display = 'block';
            viewYearly.style.display = 'none';
        });

        navYearly.addEventListener('click', () => {
            navYearly.style.background = 'var(--primary)';
            navYearly.style.color = '#000';
            navYearly.classList.remove('btn-secondary');

            navMonthly.style.background = 'transparent';
            navMonthly.style.color = 'var(--text-muted)';
            navMonthly.classList.add('btn-secondary');

            viewMonthly.style.display = 'none';
            viewYearly.style.display = 'block';
            renderPlannerYearlySummary();
        });
    }

    const bulkModal = document.getElementById('bulk-bucket-modal');
    if (bulkModal) {
        document.getElementById('open-bulk-modal').addEventListener('click', () => {
            document.getElementById('bulk-bucket-form').reset();
            bulkModal.classList.add('active');
            lucide.createIcons();
        });
        document.getElementById('close-bulk-modal').addEventListener('click', () => bulkModal.classList.remove('active'));
        bulkModal.addEventListener('click', e => { if (e.target === bulkModal) bulkModal.classList.remove('active'); });

        document.getElementById('bulk-bucket-form').addEventListener('submit', e => {
            e.preventDefault();
            const text = document.getElementById('bulk-bucket-text').value.trim();
            if (!text) return;
            const key = getPlannerKey();
            if (!AppState.monthlyPlans[key]) AppState.monthlyPlans[key] = { income: 0, buckets: [] };

            const lines = text.split('\n');
            let addedCount = 0;
            lines.forEach((line, index) => {
                if (!line.trim()) return;
                const parts = line.split(',').map(p => p.trim());
                if (parts.length >= 2) {
                    const name = parts[0];
                    const amount = Number(parts[1]);
                    const category = parts[2] || 'Other';
                    if (name && amount) {
                        AppState.monthlyPlans[key].buckets.push({
                            id: Date.now().toString() + index,
                            name,
                            amount,
                            category,
                            paid: false
                        });
                        addedCount++;
                    }
                }
            });
            if (addedCount > 0) {
                saveState();
                renderPlanner();
                bulkModal.classList.remove('active');
            } else {
                alert("Couldn't parse rows. Make sure you use 'Name, Amount' format.");
            }
        });
    }

    // Income input — save on blur/change
    document.getElementById('planner-income-input').addEventListener('change', e => {
        const key = getPlannerKey();
        if (!AppState.monthlyPlans[key]) AppState.monthlyPlans[key] = { income: 0, buckets: [] };
        AppState.monthlyPlans[key].income = Number(e.target.value) || 0;
        saveState();
        renderPlannerStats();
    });

    // Planner month nav
    document.getElementById('planner-prev').addEventListener('click', () => {
        plannerMonth--; if (plannerMonth < 0) { plannerMonth = 11; plannerYear--; }
        renderPlanner();
    });
    document.getElementById('planner-next').addEventListener('click', () => {
        plannerMonth++; if (plannerMonth > 11) { plannerMonth = 0; plannerYear++; }
        renderPlanner();
    });

    // Asset Modal wiring
    const assetModal = document.getElementById('asset-modal');
    document.getElementById('open-asset-modal').addEventListener('click', () => {
        document.getElementById('asset-modal-title').textContent = 'Add Asset';
        document.getElementById('asset-edit-id').value = '';
        document.getElementById('asset-form').reset();
        document.getElementById('asset-networth').checked = true;
        document.getElementById('asset-cagr-group').style.display = 'none';
        assetModal.classList.add('active');
        lucide.createIcons();
    });
    document.getElementById('close-asset-modal').addEventListener('click', () => assetModal.classList.remove('active'));
    assetModal.addEventListener('click', (e) => { if (e.target === assetModal) assetModal.classList.remove('active'); });

    // Show/hide CAGR field based on appreciating toggle
    document.getElementById('asset-appreciating').addEventListener('change', (e) => {
        document.getElementById('asset-cagr-group').style.display = e.target.checked ? 'block' : 'none';
    });

    // Asset Form submit (Add + Edit)
    document.getElementById('asset-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('asset-edit-id').value;
        const name = document.getElementById('asset-name').value.trim();
        const purchaseValue = Number(document.getElementById('asset-value').value);
        const yearBought = Number(document.getElementById('asset-year').value);
        const isAppreciating = document.getElementById('asset-appreciating').checked;
        const cagr = isAppreciating ? (Number(document.getElementById('asset-cagr').value) || 0) : 0;
        const countInNetWorth = document.getElementById('asset-networth').checked;

        if (!name || !purchaseValue || !yearBought) {
            alert('Please fill in Asset Name, Purchase Value, and Year of Purchase.');
            return;
        }

        if (!AppState.assets) AppState.assets = [];

        if (editId) {
            const asset = AppState.assets.find(a => a.id === editId);
            if (asset) { Object.assign(asset, { name, purchaseValue, yearBought, isAppreciating, cagr, countInNetWorth }); }
        } else {
            AppState.assets.push({ id: Date.now().toString(), name, purchaseValue, yearBought, isAppreciating, cagr, countInNetWorth });
        }

        saveState();
        assetModal.classList.remove('active');
    });

    // Loan Modal wiring
    const loanModal = document.getElementById('loan-modal');
    const openLoanModalBtn = document.getElementById('open-loan-modal');
    const closeLoanModalBtn = document.getElementById('close-loan-modal');

    openLoanModalBtn.addEventListener('click', () => {
        document.getElementById('loan-modal-title').textContent = 'Add New Loan';
        document.getElementById('loan-edit-id').value = '';
        document.getElementById('loan-form').reset();
        loanModal.classList.add('active');
        lucide.createIcons();
    });

    closeLoanModalBtn.addEventListener('click', () => loanModal.classList.remove('active'));
    loanModal.addEventListener('click', (e) => { if (e.target === loanModal) loanModal.classList.remove('active'); });

    // Loan Form submit (Add + Edit)
    const loanForm = document.getElementById('loan-form');
    loanForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('loan-edit-id').value;
        const purpose = document.getElementById('loan-purpose').value.trim();
        const emi = Number(document.getElementById('loan-emi').value);
        const totalEmis = Number(document.getElementById('loan-total-emis').value);
        const startDate = document.getElementById('loan-start-date').value;
        const paidUpto = document.getElementById('loan-paid-upto').value;

        // Manual validation for required fields
        if (!purpose || !emi || !totalEmis || !startDate) {
            alert('Please fill in all required fields: Purpose, EMI Amount, Total EMIs, and 1st EMI Date.');
            return;
        }

        let emisPaid = 0;
        if (startDate && paidUpto) {
            const startD = new Date(startDate);
            const [paidY, paidM] = paidUpto.split('-');
            const monthsDiff = (parseInt(paidY) - startD.getFullYear()) * 12 + (parseInt(paidM) - (startD.getMonth() + 1));
            emisPaid = Math.min(Math.max(0, monthsDiff + 1), totalEmis);
        }

        if (!AppState.loans) AppState.loans = [];

        if (editId) {
            // Edit existing loan
            const loan = AppState.loans.find(l => l.id === editId);
            if (loan) {
                loan.purpose = purpose;
                loan.emi = emi;
                loan.totalEmis = totalEmis;
                loan.startDate = startDate;
                if (paidUpto) loan.emisPaid = emisPaid;
            }
        } else {
            // New loan
            AppState.loans.push({ id: Date.now().toString(), purpose, emi, totalEmis, startDate, emisPaid });
        }

        saveState();
        loanModal.classList.remove('active');
        loanForm.reset();
    });
}

// --- MODAL LOGIC ---
function setupModal() {
    const modal = document.getElementById('goal-modal');
    const closeBtn = document.getElementById('close-modal');

    if (!modal) return;

    closeBtn.addEventListener('click', closeGoalModal);

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeGoalModal();
    });

    // Edit Goal Form Submit
    const editGoalForm = document.getElementById('edit-goal-form');
    editGoalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-goal-id').value;
        const goal = AppState.goals.find(g => g.id === id);
        if (goal) {
            goal.name = document.getElementById('edit-goal-name').value;
            goal.targetToday = Number(document.getElementById('edit-goal-target').value);
            goal.inflationRate = Number(document.getElementById('edit-goal-inflation').value) || 6;
            goal.countInNetWorth = document.getElementById('edit-goal-networth').checked;
            goal.investment = document.getElementById('edit-goal-investment').value;

            saveState();
            closeGoalModal();
            renderGoals();
        }
    });

    // Monthly Ledger Form Submit
    const monthlyForm = document.getElementById('monthly-ledger-form');
    monthlyForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-goal-id').value;
        const goal = AppState.goals.find(g => g.id === id);
        if (goal) {
            const dateStr = document.getElementById('monthly-date').value; // YYYY-MM
            const invested = Number(document.getElementById('monthly-invested').value);
            const corpus = Number(document.getElementById('monthly-corpus').value);

            if (!goal.monthlyLogs) goal.monthlyLogs = [];

            const existingIdx = goal.monthlyLogs.findIndex(m => m.date === dateStr);
            if (existingIdx > -1) {
                goal.monthlyLogs[existingIdx] = { date: dateStr, invested, corpus };
            } else {
                goal.monthlyLogs.push({ date: dateStr, invested, corpus });
            }

            recalculateGoalSaved(goal.id);
            saveState();
            monthlyForm.reset();
            renderMonthlyLogs(goal.id);
            renderGoals();
        }
    });
}

// --- ROW ACTIONS & MATH ---
window.editLog = function (goalId, monthStr) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (!goal || !goal.monthlyLogs) return;

    const item = goal.monthlyLogs.find(m => m.date === monthStr);
    if (item) {
        document.getElementById('monthly-date').value = item.date;
        document.getElementById('monthly-invested').value = item.invested;
        document.getElementById('monthly-corpus').value = item.corpus;
    }
};

window.deleteLog = function (goalId, monthStr) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (!goal || !goal.monthlyLogs) return;

    goal.monthlyLogs = goal.monthlyLogs.filter(m => m.date !== monthStr);
    recalculateGoalSaved(goal.id);
    saveState();
    renderMonthlyLogs(goal.id);
    renderGoals();
};

function recalculateGoalSaved(goalId) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (!goal) return;

    if (!goal.monthlyLogs || goal.monthlyLogs.length === 0) {
        goal.saved = 0;
        return;
    }

    // Sort descending by date (YYYY-MM string sorts properly alphabetically)
    const sorted = [...goal.monthlyLogs].sort((a, b) => b.date.localeCompare(a.date));
    goal.saved = sorted[0].corpus;
}

window.openGoalModal = function(id) {
    const goal = AppState.goals.find(g => g.id === id);
    if (!goal) return;

    document.getElementById('edit-goal-id').value = goal.id;
    document.getElementById('edit-goal-name').value = goal.name;
    document.getElementById('edit-goal-target').value = goal.targetToday || goal.target || 0;
    document.getElementById('edit-goal-inflation').value = goal.inflationRate !== undefined ? goal.inflationRate : 6;

    const nwCheckbox = document.getElementById('edit-goal-networth');
    nwCheckbox.checked = goal.countInNetWorth !== false;

    document.getElementById('edit-goal-investment').value = goal.investment || '';

    document.getElementById('goal-modal').classList.add('active');

    // Render the table
    renderMonthlyLogs(id);
}

window.closeGoalModal = function() {
    document.getElementById('goal-modal').classList.remove('active');
}

window.deleteGoal = function () {
    const id = document.getElementById('edit-goal-id').value;
    if (!id) return;

    if (confirm('Are you sure you want to delete this goal? This cannot be undone.')) {
        AppState.goals = AppState.goals.filter(g => g.id !== id);
        saveState();
        closeGoalModal();
        renderGoals();
    }
};

function renderMonthlyLogs(id) {
    const goal = AppState.goals.find(g => g.id === id);
    if (!goal) return;

    const tbody = document.getElementById('monthly-list-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!goal.monthlyLogs || goal.monthlyLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align: center; padding: 16px;">No monthly logs recorded yet.</td></tr>';
        return;
    }

    // Sort descending by date
    const sorted = [...goal.monthlyLogs].sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(inv => {
        // format date string from YYYY-MM to Month Year
        let dateDisplay = inv.date;
        try {
            const [y, m] = inv.date.split('-');
            const dateObj = new Date(y, m - 1);
            dateDisplay = dateObj.toLocaleString('default', { month: 'short', year: 'numeric' });
        } catch (e) { }

        tbody.innerHTML += `
            <tr>
                <td>${dateDisplay}</td>
                <td>${formatCurrency(inv.invested)}</td>
                <td class="text-success font-bold">${formatCurrency(inv.corpus)}</td>
                <td>
                    <div style="display:flex;">
                        <button type="button" class="btn-icon" style="padding:4px" onclick="editLog('${id}', '${inv.date}')"><i data-lucide="edit-2" class="icon-sm"></i></button>
                        <button type="button" class="btn-icon" style="padding:4px" onclick="deleteLog('${id}', '${inv.date}')"><i data-lucide="trash" class="icon-sm text-danger"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
    lucide.createIcons();
}

// --- CURRENCY FORMATTER ---
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

// --- CALCULATIONS ---
function calculateMonthlyPlanner() {
    const p = AppState.planner;
    const totalFixed = p.rent + p.emi + p.fuel + p.utilities;
    const savings = p.income - totalFixed;
    return { totalFixed, savings };
}

function calculateCurrentMonthAvg() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    // Filter expenses for current month
    const thisMonthExpenses = AppState.expenses.filter(exp => {
        const expDate = new Date(exp.date);
        return expDate.getMonth() === currentMonth && expDate.getFullYear() === currentYear;
    });

    const totalSpent = thisMonthExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Use current day for average up to now, 
    // or daysInMonth for average over whole month. 
    // Let's use current day of month so average is realistic to date.
    const currentDay = now.getDate();

    return totalSpent / currentDay;
}

// --- UI UPDATES ---
function updateUI() {
    renderPlanner();
    renderGoals();
    renderExpenses();
    renderOverview();
    renderLoans();
    renderAssets();
    lucide.createIcons();
}




function renderGoals() {
    const container = document.getElementById('goals-list-container');
    const overviewContainer = document.getElementById('overview-goals-list');

    container.innerHTML = '';
    overviewContainer.innerHTML = '';

    if (AppState.goals.length === 0) {
        container.innerHTML = '<p class="text-muted">No goals added yet.</p>';
        overviewContainer.innerHTML = '<p class="text-muted">No active goals.</p>';
        return;
    }

    const currentYear = new Date().getFullYear();

    AppState.goals.forEach((goal, idx) => {
        // Fallbacks for older data structures
        const targetToday = goal.targetToday || goal.target || 0;
        const creationYear = goal.creationYear || currentYear;
        const inflationRate = (goal.inflationRate !== undefined) ? goal.inflationRate : 6;
        const monthlySip = goal.monthlySip || 0;

        const yearsElapsed = Math.max(0, currentYear - creationYear);

        // 1. Inflation Adjusted Target
        const adjustedTarget = targetToday * Math.pow(1 + inflationRate / 100, yearsElapsed);

        // 2. Percentages
        const currentPercent = adjustedTarget > 0 ? Math.min(100, Math.round((goal.saved / adjustedTarget) * 100)) : 0;

        const inNW = goal.countInNetWorth !== false;
        const nwBadge = inNW
            ? `<span style="font-size:0.7rem; background:rgba(16,185,129,0.15); color:var(--success); border:1px solid var(--success); border-radius:20px; padding:2px 8px;">Net Worth</span>`
            : `<span style="font-size:0.7rem; background:rgba(255,255,255,0.05); color:var(--text-muted); border:1px solid var(--border-color); border-radius:20px; padding:2px 8px;">Not counted</span>`;

        const html = `
            <div class="goal-item" onclick="openGoalModal('${goal.id}')" style="cursor:pointer;">
                <div class="goal-header" style="margin-bottom:12px;">
                    <h4 style="margin:0; font-size:1.1rem; display:flex; align-items:center; gap:8px;">${goal.name} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">Est. ${creationYear}</span></h4>
                    ${nwBadge}
                </div>
                
                <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; padding:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Adjusted Target (at ${inflationRate}% inf.)</div>
                        <div style="font-weight:700; color:var(--text-main); font-size:1.1rem;">${formatCurrency(adjustedTarget)}</div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;">
                    <span style="color:var(--text-muted);">Currently Saved: <strong style="color:var(--text-main);">${formatCurrency(goal.saved)}</strong></span>
                </div>
                
                <div class="progress-bar-container" style="height:6px; margin-bottom:8px; background:rgba(255,255,255,0.05); position:relative; overflow:hidden;">
                    <!-- Current Saved Progress -->
                    <div class="progress-bar-fill" style="width: ${currentPercent}%; background:var(--success); position:absolute; top:0; left:0; height:100%; z-index:2;"></div>
                </div>
                
                <div style="font-size:0.75rem; color:var(--text-muted); display:flex; justify-content:space-between;">
                    <span>Monthly SIP: <strong>${formatCurrency(monthlySip)}</strong></span>
                    <span class="text-success font-bold">${currentPercent}% achieved</span>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', html);

        if (idx === 0) {
            overviewContainer.insertAdjacentHTML('beforeend', html);
        }
    });

    if (AppState.goals.length > 1) {
        overviewContainer.insertAdjacentHTML('beforeend', `<button class="btn btn-secondary w-full" style="margin-top:8px;" onclick="window.switchTab('goals')">See More (${AppState.goals.length - 1} Other${AppState.goals.length > 2 ? 's' : ''})</button>`);
    } else if (AppState.goals.length === 1) {
        overviewContainer.insertAdjacentHTML('beforeend', `<button class="btn btn-secondary w-full" style="margin-top:8px;" onclick="window.switchTab('goals')">Manage Goals</button>`);
    }
}

// ── PLANNER ──────────────────────────────────────────────────────────────────

let plannerYear = new Date().getFullYear();
let plannerMonth = new Date().getMonth();

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CATEGORY_ICONS = {
    housing: '🏠', food: '🍔', transport: '🚗', utilities: '⚡',
    loans: '🏦', health: '💊', entertainment: '🎬', savings: '💰', other: '📦'
};

function getPlannerKey(year = plannerYear, month = plannerMonth) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getPlannerData(year = plannerYear, month = plannerMonth) {
    const key = getPlannerKey(year, month);
    return AppState.monthlyPlans[key] || { income: 0, buckets: [] };
}

function renderPlanner() {
    const label = document.getElementById('planner-month-label');
    if (label) label.textContent = `${MONTH_NAMES[plannerMonth]} ${plannerYear}`;

    const incomeInput = document.getElementById('planner-income-input');
    const data = getPlannerData();
    if (incomeInput) incomeInput.value = data.income || '';

    renderPlannerStats();
    renderPlannerBuckets();
    renderPlannerComparison();
    renderPlannerYearlySummary();
    lucide.createIcons();
}

function renderPlannerStats() {
    const data = getPlannerData();
    const buckets = data.buckets || [];
    const income = data.income || 0;
    const totalPlanned = buckets.reduce((s, b) => s + b.amount, 0);
    const totalPaid = buckets.filter(b => b.paid).reduce((s, b) => s + b.amount, 0);
    const remaining = totalPlanned - totalPaid;
    const savings = income - totalPlanned;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('planner-stat-income', formatCurrency(income));
    set('planner-stat-planned', formatCurrency(totalPlanned));
    set('planner-stat-paid', formatCurrency(totalPaid));
    set('planner-stat-remaining', formatCurrency(remaining));
    set('planner-stat-savings', formatCurrency(savings));

    const savingsEl = document.getElementById('planner-stat-savings');
    if (savingsEl) savingsEl.style.color = savings >= 0 ? 'var(--success)' : 'var(--danger)';
}

function renderPlannerBuckets() {
    const container = document.getElementById('planner-buckets-list');
    if (!container) return;
    const data = getPlannerData();
    const buckets = data.buckets || [];

    if (buckets.length === 0) {
        let prevMonth = plannerMonth - 1, prevYear = plannerYear;
        if (prevMonth < 0) { prevMonth = 11; prevYear--; }
        const prevData = getPlannerData(prevYear, prevMonth);
        const prevBuckets = prevData.buckets || [];

        let copyBtnHtml = '';
        if (prevBuckets.length > 0) {
            copyBtnHtml = `
            <div style="margin-top:20px;">
                <button onclick="copyPrevMonthBuckets()" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px;">
                    <i data-lucide="copy" class="icon-sm"></i> Copy ${prevBuckets.length} buckets from ${SHORT_MONTHS[prevMonth]}
                </button>
            </div>`;
        }

        container.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">
                <div style="font-size:2rem; margin-bottom:12px;">💰</div>
                <div style="font-weight:600; margin-bottom:6px;">No buckets yet</div>
                <div style="font-size:0.85rem;">Click <strong>Add Bucket</strong> to start planning your ${MONTH_NAMES[plannerMonth]} expenses.</div>
                ${copyBtnHtml}
            </div>`;
        return;
    }

    container.innerHTML = buckets.map(b => {
        const icon = CATEGORY_ICONS[(b.category || '').toLowerCase()] || '📦';
        const paidColor = b.paid ? 'var(--success)' : 'var(--text-muted)';
        const cardBg = b.paid ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.02)';
        const borderColor = b.paid ? 'rgba(16,185,129,0.3)' : 'var(--border-color)';
        return `
        <div style="background:${cardBg}; border:1px solid ${borderColor}; border-radius:14px; padding:18px 20px; transition:all 0.2s;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:1.4rem;">${icon}</span>
                    <div>
                        <div style="font-weight:600; font-size:0.95rem; ${b.paid ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${b.name}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:capitalize;">${b.category}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:700; font-size:1.1rem; color:${b.paid ? 'var(--success)' : 'var(--text-main)'};">${formatCurrency(b.amount)}</div>
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <button onclick="toggleBucketPaid('${b.id}')"
                    style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid ${paidColor};
                           background:${b.paid ? 'rgba(16,185,129,0.15)' : 'transparent'};
                           color:${paidColor}; cursor:pointer; font-size:0.82rem; font-weight:600; transition:all 0.2s;">
                    ${b.paid ? '✅ Paid' : '⬜ Mark as Paid'}
                </button>
                <button onclick="editBucket('${b.id}')"
                    style="padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.2);
                           background:transparent; color:var(--text-main); cursor:pointer; font-size:0.82rem; transition:all 0.2s; min-width:44px;" title="Edit">
                    ✏️
                </button>
                <button onclick="deleteBucket('${b.id}')"
                    style="padding:8px 12px; border-radius:8px; border:1px solid rgba(239,68,68,0.3);
                           background:transparent; color:var(--danger); cursor:pointer; font-size:0.82rem; transition:all 0.2s; min-width:44px;" title="Delete">
                    🗑
                </button>
            </div>
        </div>`;
    }).join('');
}

function renderPlannerComparison() {
    const prevEl = document.getElementById('planner-comparison-list');
    const labelEl = document.getElementById('planner-prev-label');
    if (!prevEl) return;

    // Previous month
    let prevMonth = plannerMonth - 1, prevYear = plannerYear;
    if (prevMonth < 0) { prevMonth = 11; prevYear--; }
    const prevData = getPlannerData(prevYear, prevMonth);
    const prevBuckets = prevData.buckets || [];

    if (labelEl) labelEl.textContent = `${SHORT_MONTHS[prevMonth]} ${prevYear}`;

    if (prevBuckets.length === 0) {
        prevEl.innerHTML = '<p class="text-muted">No data for last month.</p>';
        return;
    }

    const currData = getPlannerData();
    const currBuckets = currData.buckets || [];

    let html = '<div style="display:flex; flex-direction:column; gap:10px;">';
    prevBuckets.forEach(pb => {
        const curr = currBuckets.find(cb => cb.name.toLowerCase() === pb.name.toLowerCase());
        const icon = CATEGORY_ICONS[pb.category] || '📦';
        const diff = curr ? curr.amount - pb.amount : null;
        const diffHtml = diff !== null
            ? `<span style="font-size:0.78rem; color:${diff > 0 ? 'var(--danger)' : 'var(--success)'}; font-weight:600; margin-left:8px;">${diff > 0 ? '▲' : '▼'} ${formatCurrency(Math.abs(diff))}</span>`
            : '<span style="font-size:0.78rem; color:var(--text-muted); margin-left:8px;">not in this month</span>';

        html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;
             background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span>${icon}</span>
                <span style="font-size:0.88rem;">${pb.name}</span>
                ${pb.paid ? '<span style="font-size:0.7rem; background:rgba(16,185,129,0.15); color:var(--success); padding:2px 8px; border-radius:10px;">Paid</span>' : ''}
            </div>
            <div style="display:flex; align-items:center;">
                <span style="font-weight:600;">${formatCurrency(pb.amount)}</span>
                ${diffHtml}
            </div>
        </div>`;
    });
    html += '</div>';
    prevEl.innerHTML = html;
}

window.toggleBucketPaid = function (id) {
    const key = getPlannerKey();
    const plan = AppState.monthlyPlans[key];
    if (!plan) return;
    const b = plan.buckets.find(b => b.id === id);
    if (b) { b.paid = !b.paid; saveState(); renderPlanner(); }
};

window.deleteBucket = function (id) {
    if (!confirm('Remove this bucket?')) return;
    const key = getPlannerKey();
    const plan = AppState.monthlyPlans[key];
    if (!plan) return;
    plan.buckets = plan.buckets.filter(b => b.id !== id);
    saveState();
    renderPlanner();
};

window.editBucket = function (id) {
    const key = getPlannerKey();
    const plan = AppState.monthlyPlans[key];
    if (!plan) return;
    const bucket = plan.buckets.find(b => b.id === id);
    if (!bucket) return;

    document.getElementById('edit-bucket-id').value = bucket.id;
    document.getElementById('bucket-name').value = bucket.name;
    document.getElementById('bucket-amount').value = bucket.amount;
    document.getElementById('bucket-category').value = bucket.category || '';

    const titleEl = document.getElementById('bucket-modal-title');
    if (titleEl) titleEl.textContent = '✏️ Edit Budget Bucket';

    document.getElementById('bucket-modal').classList.add('active');
};

window.copyPrevMonthBuckets = function () {
    let prevMonth = plannerMonth - 1, prevYear = plannerYear;
    if (prevMonth < 0) { prevMonth = 11; prevYear--; }

    const prevData = getPlannerData(prevYear, prevMonth);
    const prevBuckets = prevData.buckets || [];
    if (prevBuckets.length === 0) return;

    const key = getPlannerKey();
    if (!AppState.monthlyPlans[key]) AppState.monthlyPlans[key] = { income: prevData.income || 0, buckets: [] };
    else if (!AppState.monthlyPlans[key].income) AppState.monthlyPlans[key].income = prevData.income || 0;

    // Clone buckets but with new IDs and paid = false
    const cloned = prevBuckets.map(b => ({
        id: Date.now() + Math.random().toString(), // ensuring unique IDs
        name: b.name,
        amount: b.amount,
        category: b.category,
        paid: false
    }));

    AppState.monthlyPlans[key].buckets = [...AppState.monthlyPlans[key].buckets, ...cloned];
    saveState();
    renderPlanner();
};

function renderPlannerYearlySummary() {
    const listEl = document.getElementById('planner-yearly-summary-list');
    const selectEl = document.getElementById('planner-year-select');
    if (!listEl || !selectEl) return;

    // Build available years list from AppState
    let availableYears = new Set([plannerYear, new Date().getFullYear()]);
    Object.keys(AppState.monthlyPlans || {}).forEach(key => {
        const year = parseInt(key.split('-')[0]);
        if (!isNaN(year)) availableYears.add(year);
    });
    const sortedYears = Array.from(availableYears).sort((a, b) => b - a);

    // Maintain selected value or default to current plannerYear
    const currentSelected = selectEl.value ? parseInt(selectEl.value) : plannerYear;
    selectEl.innerHTML = sortedYears.map(y => `<option value="${y}" ${y === currentSelected ? 'selected' : ''}>${y}</option>`).join('');

    const targetYear = parseInt(selectEl.value || plannerYear);

    // Aggregate data for the target year
    let aggregates = {};
    let totalPlannedYear = 0;
    let totalPaidYear = 0;
    let totalIncomeYear = 0;

    Object.keys(AppState.monthlyPlans || {}).forEach(key => {
        if (key.startsWith(targetYear.toString())) {
            const mData = AppState.monthlyPlans[key];
            totalIncomeYear += (mData.income || 0);

            const buckets = mData.buckets || [];
            buckets.forEach(b => {
                const nameKey = (b.name || 'Unnamed').toLowerCase();
                if (!aggregates[nameKey]) aggregates[nameKey] = { planned: 0, paid: 0, originalName: b.name || 'Unnamed', category: b.category || 'other' };
                aggregates[nameKey].planned += b.amount;
                if (b.paid) aggregates[nameKey].paid += b.amount;

                totalPlannedYear += b.amount;
                if (b.paid) totalPaidYear += b.amount;
            });
        }
    });

    const bucketNames = Object.keys(aggregates).sort((a, b) => aggregates[b].planned - aggregates[a].planned);

    if (bucketNames.length === 0) {
        listEl.innerHTML = `<p class="text-muted" style="text-align:center; padding:20px;">No buckets found for ${targetYear}.</p>`;
        return;
    }

    const yearSavings = totalIncomeYear - totalPlannedYear;

    let html = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-bottom:16px;">
        <div style="padding:12px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:0.8rem; color:var(--text-muted);">Year Income</span><br>
            <strong class="text-success" style="font-size:1.15rem;">${formatCurrency(totalIncomeYear)}</strong>
        </div>
        <div style="padding:12px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:0.8rem; color:var(--text-muted);">Total Planned</span><br>
            <strong class="text-danger" style="font-size:1.15rem;">${formatCurrency(totalPlannedYear)}</strong>
        </div>
        <div style="padding:12px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:0.8rem; color:var(--text-muted);">Total Paid</span><br>
            <strong class="text-warning" style="font-size:1.15rem;">${formatCurrency(totalPaidYear)}</strong>
        </div>
        <div style="padding:12px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:0.8rem; color:var(--text-muted);">Est. Savings</span><br>
            <strong style="font-size:1.15rem; color:${yearSavings >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(yearSavings)}</strong>
        </div>
    </div>
    <div style="display:flex; flex-direction:column; gap:8px;">
    `;

    bucketNames.forEach(key => {
        const ag = aggregates[key];
        const icon = CATEGORY_ICONS[(ag.category || '').toLowerCase()] || '📦';
        const percentPaid = ag.planned > 0 ? Math.round((ag.paid / ag.planned) * 100) : 0;

        html += `
        <div style="padding:12px 14px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.2rem;">${icon}</span>
                    <span style="font-weight:600;">${ag.originalName}</span>
                </div>
                <div style="text-align:right;">
                    <span style="font-weight:700;">${formatCurrency(ag.planned)}</span>
                </div>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); display:flex; justify-content:space-between; margin-bottom:4px;">
                <span>${formatCurrency(ag.paid)} paid</span>
                <span>${percentPaid}%</span>
            </div>
            <div class="progress-bar-container" style="height:4px; margin:0;">
                <div class="progress-bar-fill" style="width:${percentPaid}%; background:var(--warning);"></div>
            </div>
        </div>
        `;
    });

    html += `</div>`;
    listEl.innerHTML = html;
}

// ── CALENDAR ──────────────────────────────────────────────────────────────────

// Calendar view state

let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth();

function renderExpenses() {
    renderCalendar();
    renderOverviewReflex();
    renderSpendAnalytics();
}

function renderOverviewReflex() {
    const overviewContainer = document.getElementById('overview-reflex-list');
    if (!overviewContainer) return;
    overviewContainer.innerHTML = '';
    const reflex = (AppState.expenses || []).filter(e => e.isReflex).slice(0, 5);
    if (reflex.length === 0) {
        overviewContainer.innerHTML = '<p class="text-muted">Clean week! No regret buys 🎉</p>';
        return;
    }
    reflex.forEach(exp => {
        const dateStr = new Date(exp.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        overviewContainer.insertAdjacentHTML('beforeend', `
            <div style="display:flex; justify-content:space-between; padding:8px 12px; background:var(--danger-bg); border-left:3px solid var(--danger); border-radius:6px; margin-bottom:8px;">
                <div><div style="font-size:0.875rem; font-weight:600;">${exp.purpose}</div><div style="font-size:0.75rem; color:var(--text-muted);">${dateStr}</div></div>
                <span style="color:var(--danger); font-weight:700; font-size:0.875rem;">${formatCurrency(exp.amount)}</span>
            </div>
        `);
    });
}

function renderCalendar() {
    const grid = document.getElementById('cal-grid');
    const label = document.getElementById('cal-month-label');
    if (!grid || !label) return;

    const today = new Date();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    label.textContent = `${monthNames[calViewMonth]} ${calViewYear}`;

    document.getElementById('cal-prev').onclick = () => {
        calViewMonth--; if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
        renderCalendar();
    };
    document.getElementById('cal-next').onclick = () => {
        calViewMonth++; if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
        renderCalendar();
    };

    const monthStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}`;
    const monthExpenses = (AppState.expenses || []).filter(e => e.date && e.date.startsWith(monthStr));

    const dayMap = {};
    monthExpenses.forEach(e => {
        const d = parseInt(e.date.split('-')[2]);
        if (!dayMap[d]) dayMap[d] = { total: 0, reflex: 0, items: [] };
        dayMap[d].total += e.amount;
        if (e.isReflex) dayMap[d].reflex += e.amount;
        dayMap[d].items.push(e);
    });

    const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const daysWithData = Object.keys(dayMap).length;
    const monthReflex = monthExpenses.filter(e => e.isReflex).reduce((s, e) => s + e.amount, 0);
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    const daysPassed = (calViewYear === today.getFullYear() && calViewMonth === today.getMonth())
        ? today.getDate() : daysInMonth;
    const dailyAvg = daysPassed > 0 ? monthTotal / daysPassed : 0;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('exp-monthly-total', formatCurrency(monthTotal));
    setEl('log-daily-avg', formatCurrency(dailyAvg));
    setEl('overview-daily-avg', formatCurrency(dailyAvg));
    setEl('exp-reflex-total', formatCurrency(monthReflex));
    setEl('exp-days-tracked', daysWithData);

    grid.innerHTML = '';
    const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
    for (let i = 0; i < firstDay; i++) grid.insertAdjacentHTML('beforeend', '<div></div>');

    for (let d = 1; d <= daysInMonth; d++) {
        const data = dayMap[d];
        const isToday = d === today.getDate() && calViewMonth === today.getMonth() && calViewYear === today.getFullYear();
        const hasReflex = data && data.reflex > 0;
        const hasSpend = data && data.total > 0;

        let bg = 'rgba(255,255,255,0.03)';
        let border = '1px solid rgba(255,255,255,0.06)';
        if (isToday) { bg = 'rgba(99,102,241,0.15)'; border = '1.5px solid var(--primary)'; }
        if (hasReflex) border = '1.5px solid rgba(239,68,68,0.6)';

        const dateStr = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        grid.insertAdjacentHTML('beforeend', `
            <div onclick="showDayDetail('${dateStr}')"
                style="background:${bg}; border:${border}; border-radius:8px; padding:8px 6px;
                       min-height:76px; display:flex; flex-direction:column; gap:2px;
                       cursor:${hasSpend ? 'pointer' : 'default'}; transition:background 0.2s;"
                onmouseover="if(${hasSpend}) this.style.background='rgba(255,255,255,0.07)'"
                onmouseout="this.style.background='${bg}'">
                <div style="font-size:0.72rem; font-weight:${isToday ? '700' : '500'}; color:${isToday ? 'var(--primary)' : 'var(--text-muted)'};">${d}</div>
                ${hasSpend ? `<div style="font-size:0.75rem; font-weight:700; color:var(--text-main); margin-top:auto; line-height:1.2;">${formatCurrency(data.total)}</div>` : ''}
                ${hasReflex ? `<div style="font-size:0.68rem; color:var(--danger);">⚡ ${formatCurrency(data.reflex)}</div>` : ''}
            </div>
        `);
    }
}

window.showDayDetail = function (dateStr) {
    const dayExpenses = (AppState.expenses || []).filter(e => e.date === dateStr);
    if (dayExpenses.length === 0) return;
    const detail = document.getElementById('cal-day-detail');
    const title = document.getElementById('cal-detail-title');
    const list = document.getElementById('cal-detail-list');

    const d = new Date(dateStr + 'T12:00:00');
    title.textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const total = dayExpenses.reduce((s, e) => s + e.amount, 0);
    const reflexTotal = dayExpenses.filter(e => e.isReflex).reduce((s, e) => s + e.amount, 0);

    let html = `<div style="display:flex; gap:20px; margin-bottom:16px; flex-wrap:wrap;">
        <span style="font-size:0.85rem; color:var(--text-muted);">Total: <strong style="color:var(--text-main);">${formatCurrency(total)}</strong></span>
        ${reflexTotal > 0 ? `<span style="font-size:0.85rem; color:var(--text-muted);">Reflex: <strong style="color:var(--danger);">${formatCurrency(reflexTotal)}</strong></span>` : ''}
    </div>`;

    dayExpenses.forEach(e => {
        html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px;
                background:${e.isReflex ? 'var(--danger-bg)' : 'rgba(255,255,255,0.03)'}; 
                border-left:3px solid ${e.isReflex ? 'var(--danger)' : 'transparent'};
                border-radius:8px; margin-bottom:8px;">
            <div>
                <div style="font-weight:600; font-size:0.9rem;">${e.purpose}</div>
                ${e.isReflex ? '<div style="font-size:0.75rem; color:var(--danger);">⚡ Could\'ve Avoided</div>' : ''}
            </div>
            <span style="font-weight:700; color:${e.isReflex ? 'var(--danger)' : 'var(--text-main)'};">${formatCurrency(e.amount)}</span>
        </div>`;
    });

    list.innerHTML = html;
    detail.style.display = 'block';
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function renderSpendAnalytics() {
    const insightsEl = document.getElementById('analytics-insights');
    const chartEl = document.getElementById('analytics-chart');
    const tableEl = document.getElementById('analytics-table');
    if (!insightsEl || !chartEl || !tableEl) return;

    const today = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Build last 6 months data
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        const shortLabel = monthNames[d.getMonth()];
        const exps = (AppState.expenses || []).filter(e => e.date && e.date.startsWith(key));
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const isCurrentMonth = (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear());
        const daysPassed = isCurrentMonth ? today.getDate() : daysInMonth;
        const total = exps.reduce((s, e) => s + e.amount, 0);
        const avoidable = exps.filter(e => e.isReflex).reduce((s, e) => s + e.amount, 0);
        const daysLogged = new Set(exps.map(e => e.date)).size;
        const avgPerDay = daysPassed > 0 ? total / daysPassed : 0;
        const topSpend = exps.length ? Math.max(...exps.map(e => e.amount)) : 0;
        months.push({ key, label, shortLabel, total, avoidable, daysLogged, avgPerDay, topSpend, count: exps.length, isCurrentMonth });
    }

    const totals = months.map(m => m.total).filter(t => t > 0);
    const maxTotal = totals.length ? Math.max(...totals) : 1;
    const currentM = months[5];
    const prevM = months[4];
    const allTimeAvoidable = (AppState.expenses || []).filter(e => e.isReflex).reduce((s, e) => s + e.amount, 0);
    const avgMonthlySpend = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    const bestMonth = [...months].filter(m => m.total > 0).sort((a, b) => a.total - b.total)[0];
    const worstMonth = [...months].filter(m => m.total > 0).sort((a, b) => b.total - a.total)[0];
    const vsPrev = prevM.total > 0 ? ((currentM.total - prevM.total) / prevM.total * 100).toFixed(1) : null;

    // --- INSIGHTS ---
    const insights = [
        { label: 'This Month', value: formatCurrency(currentM.total), sub: vsPrev !== null ? `${vsPrev > 0 ? '▲' : '▼'} ${Math.abs(vsPrev)}% vs last month` : 'No prev data', color: vsPrev > 0 ? 'var(--danger)' : 'var(--success)' },
        { label: '6-Month Avg', value: formatCurrency(avgMonthlySpend), sub: 'Per month', color: 'var(--primary)' },
        { label: 'Avg / Day', value: formatCurrency(currentM.avgPerDay), sub: 'This month', color: 'var(--warning)' },
        { label: 'Avoidable (All)', value: formatCurrency(allTimeAvoidable), sub: 'Could\'ve saved', color: 'var(--danger)' },
        { label: 'Best Month', value: bestMonth ? formatCurrency(bestMonth.total) : '—', sub: bestMonth ? bestMonth.shortLabel : '', color: 'var(--success)' },
        { label: 'Worst Month', value: worstMonth ? formatCurrency(worstMonth.total) : '—', sub: worstMonth ? worstMonth.shortLabel : '', color: 'var(--danger)' },
    ];

    insightsEl.innerHTML = insights.map(ins => `
        <div class="glass" style="padding:14px 16px; border-radius:10px;">
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px;">${ins.label}</div>
            <div style="font-weight:700; font-size:1.1rem; color:${ins.color};">${ins.value}</div>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${ins.sub}</div>
        </div>
    `).join('');

    // --- BAR CHART ---
    chartEl.innerHTML = months.map(m => {
        const totalH = maxTotal > 0 ? Math.round((m.total / maxTotal) * 140) : 0;
        const avoidH = maxTotal > 0 ? Math.round((m.avoidable / maxTotal) * 140) : 0;
        return `
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0;">
            <div style="font-size:0.68rem; color:var(--text-muted); white-space:nowrap;">${m.total > 0 ? formatCurrency(m.total) : ''}</div>
            <div style="width:100%; display:flex; gap:3px; align-items:flex-end; height:140px;">
                <div style="flex:1; height:${totalH}px; background: linear-gradient(to top, var(--primary), rgba(99,102,241,0.5));
                    border-radius:4px 4px 0 0; transition:height 0.4s ease; min-height:${m.total > 0 ? 2 : 0}px;
                    position:relative;" title="Total: ${formatCurrency(m.total)}"></div>
                <div style="flex:1; height:${avoidH}px; background: linear-gradient(to top, var(--danger), rgba(239,68,68,0.5));
                    border-radius:4px 4px 0 0; transition:height 0.4s ease; min-height:${m.avoidable > 0 ? 2 : 0}px;"
                    title="Avoidable: ${formatCurrency(m.avoidable)}"></div>
            </div>
            <div style="font-size:0.72rem; color:${m.isCurrentMonth ? 'var(--primary)' : 'var(--text-muted)'}; font-weight:${m.isCurrentMonth ? '700' : '400'}; white-space:nowrap;">${m.shortLabel}</div>
        </div>`;
    }).join('');

    // --- TABLE ---
    if (months.every(m => m.total === 0)) {
        tableEl.innerHTML = '<p class="text-muted">No expense data yet. Start logging your UPI spends!</p>';
        return;
    }

    let tableHTML = `
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
            <thead>
                <tr style="border-bottom:1px solid var(--border-color);">
                    <th style="text-align:left; padding:8px 12px; color:var(--text-muted); font-weight:500;">Month</th>
                    <th style="text-align:right; padding:8px 12px; color:var(--text-muted); font-weight:500;">Total</th>
                    <th style="text-align:right; padding:8px 12px; color:var(--text-muted); font-weight:500;">Avg/Day</th>
                    <th style="text-align:right; padding:8px 12px; color:var(--text-muted); font-weight:500;">Avoidable</th>
                    <th style="text-align:right; padding:8px 12px; color:var(--text-muted); font-weight:500;">Avoidable%</th>
                    <th style="text-align:right; padding:8px 12px; color:var(--text-muted); font-weight:500;">Days Logged</th>
                    <th style="text-align:right; padding:8px 12px; color:var(--text-muted); font-weight:500;">vs Prev</th>
                </tr>
            </thead>
            <tbody>`;

    months.forEach((m, idx) => {
        const avoidPct = m.total > 0 ? ((m.avoidable / m.total) * 100).toFixed(0) : 0;
        const prev = months[idx - 1];
        let vsPrevHtml = '<span style="color:var(--text-muted);">—</span>';
        if (prev && prev.total > 0 && m.total > 0) {
            const diff = ((m.total - prev.total) / prev.total * 100).toFixed(1);
            const isUp = diff > 0;
            vsPrevHtml = `<span style="color:${isUp ? 'var(--danger)' : 'var(--success)'}; font-weight:600;">${isUp ? '▲' : '▼'} ${Math.abs(diff)}%</span>`;
        }
        tableHTML += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04); ${m.isCurrentMonth ? 'background:rgba(99,102,241,0.06);' : ''}">
                <td style="padding:10px 12px; font-weight:${m.isCurrentMonth ? '700' : '400'}; color:${m.isCurrentMonth ? 'var(--primary)' : 'var(--text-main)'};">${m.label}${m.isCurrentMonth ? ' <span style="font-size:0.7rem; background:var(--primary); color:#fff; padding:1px 6px; border-radius:10px; margin-left:4px;">now</span>' : ''}</td>
                <td style="text-align:right; padding:10px 12px; font-weight:600;">${m.total > 0 ? formatCurrency(m.total) : '<span style="color:var(--text-muted);">—</span>'}</td>
                <td style="text-align:right; padding:10px 12px; color:var(--warning);">${m.avgPerDay > 0 ? formatCurrency(m.avgPerDay) : '—'}</td>
                <td style="text-align:right; padding:10px 12px; color:var(--danger);">${m.avoidable > 0 ? formatCurrency(m.avoidable) : '—'}</td>
                <td style="text-align:right; padding:10px 12px; color:${avoidPct > 30 ? 'var(--danger)' : 'var(--text-muted)'};">${m.total > 0 ? avoidPct + '%' : '—'}</td>
                <td style="text-align:right; padding:10px 12px; color:var(--text-muted);">${m.daysLogged || '—'}</td>
                <td style="text-align:right; padding:10px 12px;">${vsPrevHtml}</td>
            </tr>`;
    });

    tableHTML += '</tbody></table></div>';
    tableEl.innerHTML = tableHTML;
}

const TIPS = [
    "Compounding creates the most wealth when left undisturbed for decades. Delaying gratification pays off.",
    "Inflation is a hidden tax on cash. Always aim for an investment CAGR higher than 6% to truly grow wealth.",
    "A car is a depreciating asset. A house is a mixed asset. Stocks and mutual funds are true appreciating assets.",
    "The 50/30/20 rule: 50% for Needs, 30% for Wants, and strictly 20% (or more) for Savings and Investments.",
    "Tackle high-interest debt (like credit cards or personal loans) before investing aggressively."
];

function renderInsights(totalAssets, totalLiabilities) {
    const tipText = document.getElementById('educational-tip-text');
    if (tipText) {
        const dayIdx = new Date().getDay();
        tipText.textContent = TIPS[dayIdx % TIPS.length];
    }

    const grid = document.getElementById('insights-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 1. Emergency Fund
    const planner = AppState.planner || { rent: 0, emi: 0, fuel: 0, utilities: 0 };
    const fixedExpenses = (planner.rent || 0) + (planner.emi || 0) + (planner.fuel || 0) + (planner.utilities || 0);
    const liquidAssets = (AppState.goals || []).reduce((sum, g) => sum + (g.saved || 0), 0);

    let efClass = 'warning';
    let efMessage = 'Data needed.';
    let efValue = '0 Months';

    if (fixedExpenses > 0) {
        const months = (liquidAssets / fixedExpenses).toFixed(1);
        efValue = `${months} Months`;
        if (months >= 6) { efClass = 'success'; efMessage = 'Excellent buffer! You are safe from sudden shocks.'; }
        else if (months >= 3) { efClass = 'warning'; efMessage = 'Good start. Aim for 6 months of living expenses.'; }
        else { efClass = 'danger'; efMessage = 'High Risk. Prioritize building an emergency fund immediately.'; }
    } else {
        efMessage = 'Fill out your Monthly Planner to unlock this insight.';
    }

    grid.innerHTML += `
        <div class="insight-card">
            <div class="insight-header">
                <div class="insight-icon" style="background:rgba(16,185,129,0.1); color:var(--success);"><i data-lucide="shield-check"></i></div>
                <div class="insight-title">Emergency Fund</div>
            </div>
            <div class="insight-value text-${efClass}">${efValue}</div>
            <div class="insight-feedback">${efMessage}</div>
        </div>
    `;

    // 2. Debt-to-Asset Ratio
    const nwClass = totalLiabilities === 0 && totalAssets > 0 ? 'success' : (totalLiabilities > totalAssets ? 'danger' : 'warning');
    let nwVal = '0%';
    let nwMsg = 'Start tracking assets to see your ratio.';
    if (totalAssets > 0) {
        const ratio = ((totalLiabilities / totalAssets) * 100).toFixed(1);
        nwVal = `${ratio}%`;
        if (ratio == 0) { nwMsg = 'Debt free! Incredible milestone. Now accelerate your wealth generation.'; }
        else if (ratio < 30) { nwMsg = 'Healthy leverage. Your debt is comfortably backed by your assets.'; }
        else if (ratio < 60) { nwMsg = 'Moderate debt. Be careful about taking on any more liabilities.'; }
        else { nwMsg = 'Warning! Your debt is too high compared to assets. Focus on paying off loans.'; }
    } else if (totalLiabilities > 0) {
        nwVal = '∞';
        nwMsg = 'You have liabilities but no tracked assets. This is highly risky.';
    }

    grid.innerHTML += `
        <div class="insight-card">
            <div class="insight-header">
                <div class="insight-icon" style="background:rgba(239,68,68,0.1); color:var(--danger);"><i data-lucide="scale"></i></div>
                <div class="insight-title">Debt-to-Asset</div>
            </div>
            <div class="insight-value text-${nwClass}">${nwVal}</div>
            <div class="insight-feedback">${nwMsg}</div>
        </div>
    `;

    // 3. Asset Quality
    const physical = AppState.assets || [];
    let appVal = liquidAssets;
    let depVal = 0;

    // Physical assets appreciation eval
    physical.forEach(a => {
        const cv = calcCurrentValue(a);
        if (a.isAppreciating) appVal += cv; else depVal += cv;
    });

    const totalAlloc = appVal + depVal;
    let allocClass = 'warning';
    let allocVal = '0%';
    let allocMsg = 'Track assets to see where your money sits.';
    if (totalAlloc > 0) {
        const appPct = ((appVal / totalAlloc) * 100).toFixed(0);
        allocVal = `${appPct}% Appreciating`;
        if (appPct >= 70) { allocClass = 'success'; allocMsg = 'Perfect! Most of your cash is in wealth-generating assets.'; }
        else if (appPct >= 40) { allocClass = 'warning'; allocMsg = 'Decent allocation, but you own a lot of depreciating assets.'; }
        else { allocClass = 'danger'; allocMsg = 'Poor allocation. Most of your money is losing value against inflation.'; }
    }

    grid.innerHTML += `
        <div class="insight-card">
            <div class="insight-header">
                <div class="insight-icon" style="background:rgba(99,102,241,0.1); color:var(--primary);"><i data-lucide="pie-chart"></i></div>
                <div class="insight-title">Asset Quality</div>
            </div>
            <div class="insight-value text-${allocClass}">${allocVal}</div>
            <div class="insight-feedback">${allocMsg}</div>
        </div>
    `;
}

function renderOverview() {
    const currentYear = new Date().getFullYear();

    // Goals contributing to net worth
    const goalAssets = (AppState.goals || []).reduce((sum, g) => {
        if (g.countInNetWorth === false) return sum;
        return sum + (g.saved || 0);
    }, 0);

    // Physical assets contributing to net worth
    const physicalAssets = (AppState.assets || []).reduce((sum, a) => {
        if (a.countInNetWorth === false) return sum;
        const yearsHeld = Math.max(0, currentYear - a.yearBought);
        const currentVal = a.isAppreciating && a.cagr > 0
            ? a.purchaseValue * Math.pow(1 + a.cagr / 100, yearsHeld)
            : a.purchaseValue;
        return sum + currentVal;
    }, 0);

    const totalAssets = goalAssets + physicalAssets;

    // Total liabilities
    const totalLiabilities = (AppState.loans || []).reduce((sum, l) => {
        const remaining = Math.max(0, (l.totalEmis - l.emisPaid)) * l.emi;
        return sum + remaining;
    }, 0);

    const netWorth = totalAssets - totalLiabilities;

    // Call our new Intelligence UI
    renderInsights(totalAssets, totalLiabilities);

    const isPositive = netWorth >= 0;

    // Update stat cards
    const nwEl = document.getElementById('overview-net-worth');
    const breakdownEl = document.getElementById('overview-nw-breakdown');
    const assetsEl = document.getElementById('overview-total-assets');
    const liabEl = document.getElementById('overview-total-liabilities');

    if (nwEl) { nwEl.textContent = formatCurrency(netWorth); nwEl.style.color = isPositive ? 'var(--success)' : 'var(--danger)'; }
    if (breakdownEl) breakdownEl.textContent = `Goals ${formatCurrency(goalAssets)} + Assets ${formatCurrency(physicalAssets)} − Loans ${formatCurrency(totalLiabilities)}`;
    if (assetsEl) assetsEl.textContent = formatCurrency(physicalAssets);  // Only physical assets
    if (liabEl) liabEl.textContent = formatCurrency(totalLiabilities);

    // Populate overview-assets-list
    const overviewAssets = document.getElementById('overview-assets-list');
    if (overviewAssets) {
        overviewAssets.innerHTML = '';
        const assets = AppState.assets || [];
        if (assets.length === 0) {
            overviewAssets.innerHTML = '<p class="text-muted">No assets added yet.</p>';
        } else {
            assets.forEach((a, idx) => {
                if (idx > 0) return; // Only process the first asset for the overview

                const cv = calcCurrentValue(a);
                const gain = cv - a.purchaseValue;
                const gainPct = a.purchaseValue > 0 ? ((gain / a.purchaseValue) * 100).toFixed(1) : 0;
                const inNW = a.countInNetWorth !== false;
                overviewAssets.insertAdjacentHTML('beforeend', `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px;">
                        <div>
                            <div style="font-weight:600; font-size:0.9rem;">${a.name}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${a.yearBought} · ${a.isAppreciating ? `CAGR ${a.cagr}%` : 'Fixed'}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; color:var(--success);">${formatCurrency(cv)}</div>
                            ${a.isAppreciating ? `<div style="font-size:0.72rem; color:${gain >= 0 ? 'var(--success)' : 'var(--danger)'};">+${gainPct}%</div>` : ''}
                            ${!inNW ? '<div style="font-size:0.7rem; color:var(--text-muted);">Excluded</div>' : ''}
                        </div>
                    </div>
                `);
            });

            if (assets.length > 1) {
                overviewAssets.insertAdjacentHTML('beforeend', `<button class="btn btn-secondary w-full" style="margin-top:8px;" onclick="window.switchTab('assets')">See More (${assets.length - 1} Other${assets.length > 2 ? 's' : ''})</button>`);
            } else if (assets.length === 1) {
                overviewAssets.insertAdjacentHTML('beforeend', `<button class="btn btn-secondary w-full" style="margin-top:8px;" onclick="window.switchTab('assets')">Manage Assets</button>`);
            }
        }
    }
}

// --- ASSETS LOGIC ---
function calcCurrentValue(asset) {
    const yearsHeld = Math.max(0, new Date().getFullYear() - asset.yearBought);
    if (asset.isAppreciating && asset.cagr > 0) {
        return asset.purchaseValue * Math.pow(1 + asset.cagr / 100, yearsHeld);
    }
    return asset.purchaseValue;
}

function renderAssets() {
    const container = document.getElementById('assets-list-container');
    if (!container) return;
    container.innerHTML = '';

    const assets = AppState.assets || [];
    if (assets.length === 0) {
        container.innerHTML = '<p class="text-muted">No assets added yet.</p>';
        return;
    }

    assets.forEach(asset => {
        const currentVal = calcCurrentValue(asset);
        const gain = currentVal - asset.purchaseValue;
        const gainPct = asset.purchaseValue > 0 ? ((gain / asset.purchaseValue) * 100).toFixed(1) : 0;
        const yearsHeld = Math.max(0, new Date().getFullYear() - asset.yearBought);
        const inNW = asset.countInNetWorth !== false;
        const nwBadge = inNW
            ? `<span style="font-size:0.7rem; background:rgba(16,185,129,0.15); color:var(--success); border:1px solid var(--success); border-radius:20px; padding:2px 8px;">Net Worth</span>`
            : `<span style="font-size:0.7rem; background:rgba(255,255,255,0.05); color:var(--text-muted); border:1px solid var(--border-color); border-radius:20px; padding:2px 8px;">Excluded</span>`;

        const html = `
            <div class="loan-card glass">
                <div class="loan-header">
                    <div>
                        <h4>${asset.name}</h4>
                        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">Bought ${asset.yearBought} · ${yearsHeld} yr${yearsHeld !== 1 ? 's' : ''} held</div>
                    </div>
                    <div style="text-align:right;">
                        ${nwBadge}
                        ${asset.isAppreciating ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">CAGR: ${asset.cagr}%</div>` : ''}
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.02); border-radius:8px; padding:12px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Purchase Value</div>
                        <div style="font-weight:600;">${formatCurrency(asset.purchaseValue)}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">Current Value</div>
                        <div style="font-weight:700; color:var(--success);">${formatCurrency(currentVal)}</div>
                    </div>
                    ${asset.isAppreciating ? `
                    <div style="grid-column:1/-1;">
                        <div style="font-size:0.75rem; color:var(--text-muted);">Total Gain</div>
                        <div style="font-weight:600; color:${gain >= 0 ? 'var(--success)' : 'var(--danger)'}">
                            ${gain >= 0 ? '+' : ''}${formatCurrency(gain)} (${gainPct}%)
                        </div>
                    </div>` : ''}
                </div>

                <div class="loan-actions" style="gap:8px; padding-top:12px;">
                    <button class="btn-icon" onclick="editAsset('${asset.id}')" title="Edit">
                        <i data-lucide="edit-2" class="icon-sm"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteAsset('${asset.id}')" title="Delete">
                        <i data-lucide="trash" class="icon-sm text-danger"></i>
                    </button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

window.editAsset = function (id) {
    const asset = AppState.assets.find(a => a.id === id);
    if (!asset) return;
    const modal = document.getElementById('asset-modal');
    document.getElementById('asset-modal-title').textContent = 'Edit Asset';
    document.getElementById('asset-edit-id').value = asset.id;
    document.getElementById('asset-name').value = asset.name;
    document.getElementById('asset-value').value = asset.purchaseValue;
    document.getElementById('asset-year').value = asset.yearBought;
    document.getElementById('asset-appreciating').checked = asset.isAppreciating;
    document.getElementById('asset-cagr-group').style.display = asset.isAppreciating ? 'block' : 'none';
    document.getElementById('asset-cagr').value = asset.cagr || '';
    document.getElementById('asset-networth').checked = asset.countInNetWorth !== false;
    modal.classList.add('active');
    lucide.createIcons();
};

window.deleteAsset = function (id) {
    if (confirm('Delete this asset?')) {
        AppState.assets = AppState.assets.filter(a => a.id !== id);
        saveState();
    }
};

// --- LOANS LOGIC ---
function renderLoans() {
    const container = document.getElementById('loans-list-container');
    const overviewContainer = document.getElementById('overview-loans-list');

    if (container) container.innerHTML = '';
    if (overviewContainer) overviewContainer.innerHTML = '';

    if (!AppState.loans || AppState.loans.length === 0) {
        const emptyMsg = '<p class="text-muted">No active loans tracked.</p>';
        if (container) container.innerHTML = emptyMsg;
        if (overviewContainer) overviewContainer.innerHTML = emptyMsg;
        return;
    }

    AppState.loans.forEach((loan, idx) => {
        const percentPaid = Math.min(100, Math.round((loan.emisPaid / loan.totalEmis) * 100));
        const percentRemaining = Math.max(0, 100 - percentPaid);
        const totalPaid = loan.emisPaid * loan.emi;
        const totalRemaining = Math.max(0, (loan.totalEmis - loan.emisPaid) * loan.emi);

        // Date Calculations
        let dateDetailsHtml = '';
        let lastPaidStr = "Pending";
        let nextPaidStr = "EMI";

        if (loan.startDate) {
            const startObj = new Date(loan.startDate);
            const dueDay = startObj.getDate();
            const lastObj = new Date(startObj);
            lastObj.setMonth(lastObj.getMonth() + loan.totalEmis - 1);

            const startStr = startObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const lastStr = lastObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

            if (loan.emisPaid > 0) {
                const lpObj = new Date(loan.startDate);
                lpObj.setMonth(lpObj.getMonth() + loan.emisPaid - 1);
                lastPaidStr = lpObj.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
            }

            if (loan.emisPaid < loan.totalEmis) {
                const npObj = new Date(loan.startDate);
                npObj.setMonth(npObj.getMonth() + loan.emisPaid);
                nextPaidStr = npObj.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            }

            const getOrdinal = (n) => {
                const s = ["th", "st", "nd", "rd"];
                const v = n % 100;
                return n + (s[(v - 20) % 10] || s[v] || s[0]);
            };

            dateDetailsHtml = `
                <div style="font-size: 0.85rem; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span><span class="text-muted">1st EMI:</span> ${startStr}</span>
                        <span><span class="text-muted">Last EMI:</span> ${lastStr}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; margin-top: 6px;">
                        <span><span class="text-muted">Due Date:</span> <strong class="text-primary">${getOrdinal(dueDay)}</strong> of every month</span>
                        <span><span class="text-muted">Last Paid EMI:</span> <strong class="text-success">${lastPaidStr}</strong></span>
                    </div>
                </div>
            `;
        }

        const html = `
            <div class="loan-card glass">
                <div class="loan-header">
                    <h4>${loan.purpose}</h4>
                    <span class="text-primary font-bold">${formatCurrency(loan.emi)} /mo</span>
                </div>
                
                ${dateDetailsHtml}

                <div class="loan-stats">
                    <span>EMIs Paid: <strong class="text-primary">${loan.emisPaid} / ${loan.totalEmis}</strong></span>
                    <span>Paid: ${formatCurrency(totalPaid)}</span>
                    <span class="text-danger">Remain: ${formatCurrency(totalRemaining)}</span>
                </div>

                <div class="loan-progress-container">
                    <div class="loan-progress-bar" style="width: ${percentPaid}%"></div>
                </div>
                
                <div class="loan-stats" style="margin-top: -8px; margin-bottom: 8px;">
                    <span>${percentPaid}% Paid Off</span>
                    <span>${percentRemaining}% Remaining</span>
                </div>
                
                <div class="loan-actions" style="gap: 12px; justify-content: flex-start; align-items: center; flex-wrap: wrap;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Last EMI Paid:</span>
                    <div style="display:flex; align-items:center; gap:6px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 10px; flex:1;">
                        <i data-lucide="calendar" class="icon-sm" style="color: var(--text-muted);"></i>
                        <input type="month" id="last-pay-${loan.id}" title="Set last paid EMI month"
                            style="background:transparent; border:none; color:var(--text-main); font-size:0.875rem; outline:none; cursor:pointer; flex:1;"
                            ${loan.startDate ? `min="${loan.startDate.substring(0, 7)}"` : ''}
                            value="${loan.lastPaidMonth || ''}">
                        <button type="button" onclick="setLastPayment('${loan.id}')"
                            style="background: var(--success); color:#fff; border:none; border-radius:6px; padding:5px 14px; font-size:0.85rem; cursor:pointer; font-weight:600; white-space:nowrap;">
                            Set
                        </button>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <button class="btn-icon" onclick="editLoan('${loan.id}')" title="Edit Loan">
                            <i data-lucide="edit-2" class="icon-sm"></i>
                        </button>
                        <button class="btn-icon" onclick="deleteLoan('${loan.id}')" title="Delete Loan">
                            <i data-lucide="trash" class="icon-sm text-danger"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        if (container) container.insertAdjacentHTML('beforeend', html);

        if (overviewContainer && idx === 0) {
            // Remove full action buttons for overview, just show static card
            const overviewHtml = html.replace(/<div class="loan-actions"[\s\S]*?<\/div>\s*<\/div>/, '</div>');
            overviewContainer.insertAdjacentHTML('beforeend', overviewHtml);
        }
    });

    if (overviewContainer) {
        if (AppState.loans.length > 1) {
            overviewContainer.insertAdjacentHTML('beforeend', `<button class="btn btn-secondary w-full" style="margin-top:8px;" onclick="window.switchTab('loans')">See More (${AppState.loans.length - 1} Other${AppState.loans.length > 2 ? 's' : ''})</button>`);
        } else if (AppState.loans.length === 1) {
            overviewContainer.insertAdjacentHTML('beforeend', `<button class="btn btn-secondary w-full" style="margin-top:8px;" onclick="window.switchTab('loans')">Manage Loans</button>`);
        }
    }
}

window.setLastPayment = function (id) {
    const loan = AppState.loans.find(l => l.id === id);
    if (!loan || !loan.startDate) return;

    const input = document.getElementById(`last-pay-${id}`);
    if (!input || !input.value) { alert('Please pick a month first.'); return; }

    const startD = new Date(loan.startDate);
    const [paidY, paidM] = input.value.split('-');
    const monthsDiff = (parseInt(paidY) - startD.getFullYear()) * 12 + (parseInt(paidM) - (startD.getMonth() + 1));
    const newEmisPaid = Math.min(Math.max(0, monthsDiff + 1), loan.totalEmis);

    loan.emisPaid = newEmisPaid;
    loan.lastPaidMonth = input.value;  // Persist the selected month
    saveState();
};

window.editLoan = function (id) {
    const loan = AppState.loans.find(l => l.id === id);
    if (!loan) return;

    const modal = document.getElementById('loan-modal');
    document.getElementById('loan-modal-title').textContent = 'Edit Loan';
    document.getElementById('loan-edit-id').value = loan.id;
    document.getElementById('loan-purpose').value = loan.purpose;
    document.getElementById('loan-emi').value = loan.emi;
    document.getElementById('loan-total-emis').value = loan.totalEmis;
    document.getElementById('loan-start-date').value = loan.startDate || '';
    document.getElementById('loan-paid-upto').value = '';

    modal.classList.add('active');
    lucide.createIcons();
};

window.payEMI = function (id) {
    const loan = AppState.loans.find(l => l.id === id);
    if (loan && loan.emisPaid < loan.totalEmis) {
        loan.emisPaid++;
        saveState();
    }
};

window.undoEMI = function (id) {
    const loan = AppState.loans.find(l => l.id === id);
    if (loan && loan.emisPaid > 0) {
        loan.emisPaid--;
        saveState();
    }
};

window.deleteLoan = function (id) {
    if (confirm("Are you sure you want to delete this loan?")) {
        AppState.loans = AppState.loans.filter(l => l.id !== id);
        saveState();
    }
};
