# 🔥 Firebase Migration Guide — FinTrack

A complete reference for moving from `localStorage` to Firebase (Firestore + Google Auth + Hosting).

---

## Current Stack

| Layer | Current | After Migration |
|---|---|---|
| Data storage | `localStorage` (browser only) | Firestore (Google cloud) |
| Login | None | Google Sign-In |
| Hosting | Local file | Firebase Hosting |
| Domain | None | Custom domain (e.g. `myfinance.in`) |

---

## Why Firebase?

- ✅ Google Auth built-in (no custom auth code)
- ✅ Firestore DB — real-time, NoSQL, scales automatically
- ✅ Free tier is more than enough for personal use
- ✅ Works from localhost during development — no deployment needed to test
- ✅ Custom domain support for free

---

## Cost Breakdown

| Item | Cost |
|---|---|
| Firebase Firestore (free tier: 50K reads/20K writes per day) | **₹0/month** |
| Firebase Authentication | **₹0/month** |
| Firebase Hosting | **₹0/month** |
| Custom `.in` domain (Namecheap) | ~**₹500/year** |
| Custom `.com` domain (Namecheap) | ~**₹800–1,500/year** |

**Total: Just the cost of the domain.**

---

## Firestore Database Structure

```
firestore/
└── users/
    └── {uid}/                          ← one document per Google user
        │
        ├── settings (document)
        │   ├── income: 75000
        │   └── createdAt: timestamp
        │
        ├── fixedExpenses/              ← sub-collection
        │   └── {docId}
        │       ├── name: "Rent"
        │       └── amount: 15000
        │
        ├── goals/                      ← sub-collection
        │   └── {docId}
        │       ├── name: "Bike"
        │       ├── target: 150000
        │       ├── saved: 40000
        │       ├── investment: "SIP ₹5k/mo in Nifty50"
        │       ├── countInNetWorth: true
        │       └── yearlyLog: [
        │               { year: 2024, amount: 20000 },
        │               { year: 2025, amount: 20000 }
        │           ]
        │
        ├── expenses/                   ← sub-collection
        │   └── {docId}
        │       ├── date: "2026-04-15"
        │       ├── amount: 320
        │       ├── purpose: "Swiggy"
        │       └── isReflex: true
        │
        ├── loans/                      ← sub-collection
        │   └── {docId}
        │       ├── name: "Home Loan"
        │       ├── bankName: "HDFC"
        │       ├── emi: 22000
        │       ├── totalEmis: 240
        │       ├── emisPaid: 36
        │       └── lastPaidDate: "2026-04-01"
        │
        └── assets/                     ← sub-collection
            └── {docId}
                ├── name: "Flat"
                ├── purchaseValue: 4500000
                ├── yearBought: 2020
                ├── isAppreciating: true
                ├── cagr: 8
                └── countInNetWorth: true
```

---

## Step-by-Step Migration

### Step 1 — Create Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g. `fintrack`)
3. Disable Google Analytics (not needed) → **Create project**

---

### Step 2 — Enable Google Auth

1. In Firebase Console → **Authentication** → **Get started**
2. **Sign-in method** tab → Click **Google** → Enable → Save

---

### Step 3 — Create Firestore Database

1. In Firebase Console → **Firestore Database** → **Create database**
2. Choose **Start in test mode** (open access, fine for local dev)
3. Select a region (e.g. `asia-south1` for India) → **Enable**

> ⚠️ Before going public, change Firestore rules to:
> ```
> rules_version = '2';
> service cloud.firestore {
>   match /databases/{database}/documents {
>     match /users/{userId}/{document=**} {
>       allow read, write: if request.auth.uid == userId;
>     }
>   }
> }
> ```
> This ensures each user can only read/write their own data.

---

### Step 4 — Get Firebase Config

1. Firebase Console → **Project Settings** (gear icon) → **General**
2. Scroll to **Your apps** → Click **Add app** → Choose **Web (`</>`)**
3. Register the app → Copy the config object:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc123"
};
```

---

### Step 5 — Allow Localhost for Google Auth

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Click **Add domain** → type `localhost` → **Add**

This allows Google login to work when opening the app from `http://localhost:8080`.

---

### Step 6 — Run Locally (Required for Google Auth)

Google Auth does **not** work on `file:///` URLs. You must serve via localhost:

```bash
# Navigate to your Finance folder
cd /Users/bitan/Documents/Finance

# Start a local server (Python comes pre-installed on Mac)
python3 -m http.server 8080

# Open in browser:
# http://localhost:8080
```

---

### Step 7 — Code Changes (what gets updated)

| Current code | Firebase replacement |
|---|---|
| `localStorage.setItem(...)` | `setDoc(doc(db, 'users', uid, 'collection', id), data)` |
| `localStorage.getItem(...)` | `getDocs(collection(db, 'users', uid, 'collection'))` |
| `AppState = JSON.parse(...)` | Load all collections on login |
| No login | `signInWithPopup(auth, googleProvider)` |

---

## Going Public (When Ready)

### Buy a Domain

Recommended: [Namecheap](https://namecheap.com)
- `.in` domain → ~₹500/year
- `.com` domain → ~₹800–1,500/year

### Deploy to Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize hosting in your project folder
firebase init hosting

# Deploy
firebase deploy
```

### Connect Custom Domain

1. Firebase Console → **Hosting** → **Add custom domain**
2. Enter your domain (e.g. `myfinance.in`)
3. Firebase gives you DNS records → Add them in Namecheap DNS settings
4. Wait 10–30 mins for propagation → Done ✅

---

## Firestore Free Tier Limits

| Operation | Free per day |
|---|---|
| Reads | 50,000 |
| Writes | 20,000 |
| Deletes | 20,000 |
| Storage | 1 GiB |

For a personal finance app with 1–10 users, you will **never exceed these limits**.

---

## Quick Reference — Firebase SDK Snippets

```js
// Initialize
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, setDoc, doc, deleteDoc } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Google Login
const provider = new GoogleAuthProvider();
await signInWithPopup(auth, provider);
const uid = auth.currentUser.uid;

// Save an expense
await setDoc(doc(db, 'users', uid, 'expenses', expenseId), {
  date: '2026-04-15',
  amount: 320,
  purpose: 'Swiggy',
  isReflex: true
});

// Load all expenses
const snapshot = await getDocs(collection(db, 'users', uid, 'expenses'));
const expenses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

// Delete a loan
await deleteDoc(doc(db, 'users', uid, 'loans', loanId));
```

---

## Notes

- All data is **per user** — isolated by Google UID
- Data syncs across devices automatically once a user logs in
- Existing `localStorage` data can be migrated on first login (one-time import)
- The app code (HTML/CSS/JS) stays the same — only data read/write calls change
