# Implementation Plan: Great Comfort Agreement

## Overview

Implement the Great Comfort Agreement web application incrementally, starting with project scaffolding and Firebase setup, then building the customer-facing signing flow, PDF and email services, admin dashboard, and finally wiring everything together. Each step builds directly on the previous one with no orphaned code.

---

## Tasks

- [x] 1. Project scaffolding and Firebase configuration
  - [x] 1.1 Initialise Firebase project structure
    - Create the monorepo layout: `public/` (static frontend), `functions/` (Cloud Functions), `firebase.json`, `.firebaserc`, and `functions/package.json`
    - Add Firebase Hosting rewrites so all paths (except `/api/**`) serve `public/index.html`, and `/api/**` is routed to the Cloud Function
    - Install core function dependencies: `firebase-admin`, `firebase-functions`, `express`, `cors`, `helmet`, `pdfkit`, `@sendgrid/mail` (or `nodemailer`), `crypto`
    - _Requirements: 1.5 (HTTPS enforced via Hosting), all backend requirements_

  - [x] 1.2 Write Firestore security rules
    - `agreements/{token}`: authenticated clients may `get` (read single doc by token); no `list`, `create`, `update`, or `delete` from any client
    - `submissions/{id}`: no client `read`, `create`, `update`, or `delete`; all access via Admin SDK only
    - `config/terms`: public `read`; no client writes
    - Deploy rules with `firebase deploy --only firestore:rules`
    - _Requirements: 1.6, 10.5, 13.1, 13.2_

  - [x] 1.3 Seed Firestore config and create token-generation script
    - Write `scripts/seedConfig.js` to create the `config/terms` document with `currentVersion: "v1.0"` and the full five-section Terms & Conditions text
    - Write `scripts/createToken.js` that uses `crypto.randomBytes(20).toString('hex')` to generate a token, writes a document to `agreements/{token}` with `termsVersion`, optional `prefill` fields, `submissionId: null`, and `createdAt`, then prints the resulting URL
    - _Requirements: 1.1, 2.1, 2.4_

- [x] 2. Cloud Functions — Express API skeleton and middleware
  - [x] 2.1 Set up Express app entry point with middleware
    - Create `functions/src/index.js` exporting a single `api` Cloud Function
    - Mount `cors()`, `express.json({ limit: '5mb' })`, `helmet()` middleware
    - Add a catch-all `errorHandler` middleware that returns `{ error: message }` with an appropriate HTTP status
    - _Requirements: 6.6 (graceful error responses)_

  - [x] 2.2 Implement `GET /api/agreement/:token` endpoint
    - Fetch `agreements/{token}` from Firestore; return 404 with `{ error: "not_found" }` if missing
    - Return `{ termsVersion, prefill, alreadySubmitted: submissionId !== null, submissionId }` on success
    - If `submissionId` is set, also fetch and return the full submission fields for the read-only view
    - _Requirements: 1.2, 1.3, 1.4, 2.2, 3.2_

  - [x] 2.3 Implement `verifyFirebaseToken` middleware
    - Extract `Authorization: Bearer <token>` header; call `admin.auth().verifyIdToken(token)`
    - Attach decoded token to `req.user`; return 401 if missing or invalid
    - _Requirements: 10.1, 10.2, 10.5_

  - [x] 2.4 Implement admin read endpoints
    - `GET /api/admin/submissions`: query `submissions` collection ordered by `signedAt` descending; return array of all documents
    - `GET /api/admin/submissions/:id`: fetch single submission by ID; return 404 if not found
    - Both routes protected by `verifyFirebaseToken` middleware
    - _Requirements: 11.1, 11.2, 12.1_

- [x] 3. PDF and Email services
  - [x] 3.1 Implement `pdfService.js`
    - `generatePDF(submission)`: use PDFKit to lay out the PDF in memory (company name header, Terms_Version, all five terms sections, six-field customer table, embedded signature PNG from `signatureDataUrl`, Signed Date/Time, footer "Safety is our highest priority."); return `{ buffer, filename }`
    - `uploadPDF(buffer, filename, submissionId)`: upload buffer to `gs://…/agreements/{submissionId}/{filename}` using Firebase Storage Admin SDK; return `{ storagePath, publicUrl }`
    - Wrap both functions in try/catch; on failure return `{ error }` rather than throwing, so the caller can handle gracefully
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 3.2 Implement `emailService.js`
    - `sendAgreementEmail({ submission, pdfBuffer, pdfFailed })`: compose email with subject `"New Signed Transportation Terms – ${submission.customerName}"`, HTML/text body containing all submission fields, optional PDF attachment when `pdfFailed === false`
    - Support `EMAIL_PROVIDER` env var to switch between SendGrid and Nodemailer
    - On failure, log the error with `submissionId`; throw so the caller can distinguish logging failure from send failure
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 3.3 Write unit tests for `pdfService.js`
    - Test that `generatePDF` returns a Buffer and the expected filename pattern
    - Test that all required fields appear in the raw PDF text output
    - Mock Firebase Storage for `uploadPDF` test; assert correct bucket path is used
    - _Requirements: 7.1, 7.2, 7.4_

  - [x] 3.4 Write unit tests for `emailService.js`
    - Test that the subject line is formatted correctly with the customer name
    - Test that PDF attachment is included when `pdfFailed === false` and omitted when `pdfFailed === true`
    - Mock the SendGrid/Nodemailer client
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 4. Submission endpoint — core flow
  - [x] 4.1 Implement `POST /api/submit` endpoint
    - Validate that `token`, `customerName`, `email`, `phone`, `tripDate`, `pickupLocation`, `destination`, `signatureDataUrl`, and `accepted` are all present in the request body; return 400 with field-level error list if any are missing or invalid (email format, phone 7–15 digits, `accepted === true`)
    - Fetch `agreements/{token}`; return 404 if not found, 409 if `submissionId` is already set
    - Write a new `submissions` document with all required fields plus `signedAt: admin.firestore.FieldValue.serverTimestamp()`; capture `signedDate` and `signedTime` as UTC strings server-side
    - Update `agreements/{token}` to set `submissionId` to the new document ID
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 13.1_

  - [-] 4.2 Wire PDF generation and email into submission endpoint
    - After the Firestore write succeeds, call `pdfService.generatePDF` → `pdfService.uploadPDF` → update `pdfStoragePath` on the submission document
    - Call `emailService.sendAgreementEmail` passing `pdfBuffer` (or `pdfFailed: true` on PDF error)
    - Handle email logging failure per Requirement 8.4: if `sendAgreementEmail` throws and re-logging also fails, return a 500 so the frontend can display the blocking error
    - On PDF failure, log and continue (do not block the 200 response)
    - Return `{ submissionId, status: "ok" }` on success
    - _Requirements: 6.5, 6.6, 7.3, 8.4_

  - [ ] 4.3 Write integration tests for `POST /api/submit`
    - Test happy-path: all fields valid → 200 with `submissionId`
    - Test missing required field → 400 with field errors
    - Test duplicate submission (token already has `submissionId`) → 409
    - Test invalid email format → 400
    - Test phone with fewer than 7 digits → 400
    - Mock Firestore, Storage, PDF, and email modules
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

- [ ] 5. Checkpoint — backend complete
  - Ensure all backend tests pass. Verify the API locally with the Firebase Emulator Suite (`firebase emulators:start`). Ask the user if any questions arise before proceeding to the frontend.

- [ ] 6. Static frontend — shared assets and home page
  - [x] 6.1 Create HTML shell files and global CSS
    - Create `public/index.html` (home/landing page with a brief description and CTA)
    - Create `public/terms.html`, `public/confirmation.html`, `public/admin/login.html`, `public/admin/dashboard.html`, `public/admin/detail.html` as HTML shells with shared `<head>` (charset, viewport, CSS link, Firebase SDK scripts)
    - Write `public/css/styles.css` with layout, form, table, button, error-state, and signature canvas styles; canvas must have `min-width: 300px; min-height: 150px`
    - _Requirements: 5.5, all UI requirements_

  - [x] 6.2 Implement `public/js/validation.js`
    - Pure functions (no DOM dependencies): `isValidEmail(value)`, `isValidPhone(value)` (7–15 digits), `validateFormFields(fields)` returning an array of `{ field, message }` errors
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 6.1, 6.2_

  - [-] 6.3 Write unit tests for `validation.js`
    - Test `isValidEmail` with valid and invalid inputs including edge cases (no `@`, multiple `@`, missing domain)
    - Test `isValidPhone` with 6-digit (fail), 7-digit (pass), 15-digit (pass), 16-digit (fail) inputs
    - Test `validateFormFields` with all fields empty, partial fields, and all fields valid
    - _Requirements: 3.5, 3.6_

- [ ] 7. Frontend — signature capture module
  - [-] 7.1 Implement `public/js/signature.js`
    - Import `signature_pad` from CDN or bundled; initialise `SignaturePad` on `#signature-canvas` with white background
    - Export `isEmpty()`, `clear()`, `toDataURL()` (PNG format)
    - Implement `resizeCanvas()` that preserves drawn strokes across resize events using `pad.toData()` / `pad.fromData()`; attach to `window.resize`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 8. Frontend — agreement page (`terms.html` + `agreement.js`)
  - [-] 8.1 Implement agreement page load and pre-fill
    - Extract `{token}` from the URL path in `agreement.js`
    - `GET /api/agreement/:token` on page load; on 404 display inline error "This link is invalid or has expired."
    - If `alreadySubmitted === true`, hide the form and display all stored submission fields read-only (including signature image)
    - If `alreadySubmitted === false`, populate form fields from `prefill` data and display the full editable form
    - Display `termsVersion` on the page
    - Render all five Terms & Conditions sections from the API response
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 3.2, 13.3_

  - [ ] 8.2 Implement form submission flow in `agreement.js`
    - On Submit click: call `validateFormFields`, check `signaturePad.isEmpty()`, check checkbox state
    - If any errors: display all field-level messages simultaneously and scroll to the first error
    - On valid: `POST /api/submit` with form data + signature data URL
    - On success: set `sessionStorage.setItem('greatComfort_submitted', 'true')` and navigate to `/confirmation`
    - On Firestore-write failure (API returns non-200): display "Submission failed. Please try again."
    - _Requirements: 4.1, 4.2, 5.3, 6.1, 6.2, 6.6, 9.1_

- [ ] 9. Frontend — confirmation page
  - [ ] 9.1 Implement `confirmation.html` guard and message display
    - On page load, check `sessionStorage.getItem('greatComfort_submitted')`; if absent or falsy, redirect to `/`
    - Display the three required confirmation messages: "Thank You! Your Transportation Terms & Conditions have been successfully submitted.", "Your signed acknowledgment has been received by Great Comfort Services.", "Safety is our highest priority."
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 10. Frontend — admin dashboard
  - [ ] 10.1 Implement `public/js/admin.js` — auth guard
    - Import `authGuard.js` logic inline or as a separate module: immediately set `document.body.style.display = 'none'` on load; call `firebase.auth().onAuthStateChanged(user => { if (!user) redirect('/admin/login'); else document.body.style.display = '' })`
    - Apply guard to `dashboard.html` and `detail.html`
    - _Requirements: 10.1, 10.2_

  - [ ] 10.2 Implement admin login page (`login.html`)
    - On form submit call `firebase.auth().signInWithEmailAndPassword(email, password)`
    - On success navigate to `/admin/dashboard`
    - On failure display "Invalid email or password."
    - _Requirements: 10.3, 10.4_

  - [ ] 10.3 Implement submissions table in `dashboard.html`
    - On page load (after auth guard passes), `GET /api/admin/submissions` with `Authorization: Bearer <idToken>`
    - Render table with columns: Passenger Name, Trip Date, Status (always "Signed"), and Signed Date
    - Sort is handled server-side (already descending by `signedAt`)
    - On row click navigate to `/admin/detail?id={submissionId}`
    - On fetch error display an error message and block further table rendering
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ] 10.4 Implement submission detail view in `detail.html`
    - Read `id` query param; `GET /api/admin/submissions/:id` with Bearer token
    - Display all fields: Passenger Name, Email, Phone Number, Trip Date, Pickup Location, Destination, Terms_Version, Accepted status, Signed Date, Signed Time, signature image
    - If `pdfStoragePath` is set: show "View PDF" (opens in new tab) and "Download PDF" buttons using the storage URL
    - If `pdfStoragePath` is null: hide both buttons and show "PDF unavailable" message
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [ ] 11. Checkpoint — full stack integration
  - Ensure all tests pass. Run the app against the Firebase Emulator Suite end-to-end: create a token, sign an agreement, verify Firestore doc, PDF in Storage, email sent, admin dashboard lists the submission, detail view shows all fields. Ask the user if questions arise before finalising.

- [ ] 12. Final wiring and Firebase deployment configuration
  - [ ] 12.1 Configure `firebase.json` hosting and function rewrites
    - Set `hosting.public` to `public/`
    - Add `rewrites`: all requests except `/api/**` → `**` (SPA fallback); `/api/**` → `api` Cloud Function
    - Configure Storage CORS if needed for public PDF URL access
    - _Requirements: 1.5_

  - [ ] 12.2 Add environment variable configuration
    - Document all required env vars in `functions/.env.example`: `EMAIL_PROVIDER`, `SENDGRID_API_KEY` (or SMTP settings), `STAFF_EMAIL_RECIPIENT`, `FIREBASE_STORAGE_BUCKET`
    - Wire env vars into `emailService.js` and `pdfService.js` at startup; throw a clear error if required vars are missing so misconfiguration is caught at deploy time, not at runtime
    - _Requirements: 8.1_

  - [ ] 12.3 Write end-to-end smoke tests
    - Test full customer signing flow using Firebase Emulator: create token → load agreement page → fill form → sign → submit → check Firestore doc exists → check confirmation page guard
    - Test admin flow: login → load dashboard → click row → verify detail page fields
    - _Requirements: 1.1–1.6, 6.1–6.6, 9.1–9.3, 10.1–10.5, 11.1–11.3, 12.1–12.4_

- [ ] 13. Final checkpoint — Ensure all tests pass
  - Run all unit and integration tests. Verify Firebase Emulator smoke tests pass. Ask the user if any questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP delivery
- Each task references specific requirements for full traceability
- Checkpoints (tasks 5, 11, 13) ensure incremental validation at logical boundaries
- The design has no Correctness Properties, so no property-based tests are included; unit and integration tests cover correctness
- All timestamps are captured server-side to prevent tampering (Requirement 6.3)
- PDF generation and email dispatch run asynchronously post-submission; PDF failure never blocks the 200 response (Requirement 7.3)
- Email logging failure is the only condition that blocks the confirmation page (Requirement 8.4)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "3.2", "6.2", "7.1"] },
    { "id": 3, "tasks": ["2.4", "3.3", "3.4", "4.1", "6.3"] },
    { "id": 4, "tasks": ["4.2", "8.1"] },
    { "id": 5, "tasks": ["4.3", "8.2", "9.1"] },
    { "id": 6, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 7, "tasks": ["10.4", "12.1", "12.2"] },
    { "id": 8, "tasks": ["12.3"] }
  ]
}
```
