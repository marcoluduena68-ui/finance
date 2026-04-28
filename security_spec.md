# Security Specification

## Data Invariants
1. A transaction must belong to the authenticated user (`userId` matches `auth.uid`).
2. A goal must belong to the authenticated user.
3. Users can only modify their own profiles.
4. Emails are private and only accessible by the owner.
5. Transactions and Goals are linked to the user's root document ID.

## The Dirty Dozen Payloads

### 1. Identity Spoofing (Transaction)
```json
{
  "name": "Evil Coffee",
  "amount": -5,
  "category": "food",
  "createdAt": "server_timestamp",
  "userId": "SOME_OTHER_UID"
}
```
**Result**: PERMISSION_DENIED (userId must match request.auth.uid)

### 2. State Shortcutting (Goal)
```json
{
  "title": "Free Money",
  "target": 1000,
  "current": 1000,
  "iconType": "star",
  "color": "bg-primary",
  "userId": "MY_UID"
}
```
**Result**: PERMISSION_DENIED (Attempting to create a goal with full progress manually if initial creation requires 0, or just standard check)

### 3. Resource Poisoning (ID)
Path: `/users/VERY_LONG_ID_OR_MALICIOUS_CHARS/transactions/abc`
**Result**: PERMISSION_DENIED (isValidId check)

### 4. Shadow Update (Goal)
```json
{
  "title": "Modified Title",
  "target": 5000,
  "current": 0,
  "iconType": "car",
  "color": "bg-blue-500",
  "userId": "MY_UID",
  "isAdmin": true
}
```
**Result**: PERMISSION_DENIED (affectedKeys().hasOnly() prevents extra fields)

### 5. PII Blanket Read
Querying `/users/{SOMEONE_ELSE_UID}/private/info`
**Result**: PERMISSION_DENIED (only isOwner() can read private/info)

### 6. Temporal Integrity (Transaction)
```json
{
  "name": "Future Transaction",
  "amount": -100,
  "category": "other",
  "createdAt": "2027-01-01T00:00:00Z",
  "userId": "MY_UID"
}
```
**Result**: PERMISSION_DENIED (createdAt must be request.time)

### 7. Denial of Wallet (Size Attack)
Name: `new string('A', 1000000)`
**Result**: PERMISSION_DENIED (.size() check)

### 8. Orphaned Document (Goal)
Creating goal for non-existent user path.
**Result**: PERMISSION_DENIED (exists(/databases/$(database)/documents/users/$(userId)))

### 9. Price Manipulation (Goal Update)
Updating `target` to 0 to "complete" the goal instantly.
**Result**: PERMISSION_DENIED (Only specific fields allowed for update actions)

### 10. Email Spoofing
Setting `email_verified` manually if rules depended on it.
**Result**: PERMISSION_DENIED (Relies on auth token)

### 11. Collection Scraping
Querying `/users` list.
**Result**: PERMISSION_DENIED (No top-level list access)

### 12. Cross-User Write
Writing to `/users/OTHER_UID/goals/abc`.
**Result**: PERMISSION_DENIED (isOwner(userId) check)
