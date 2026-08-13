# Requirements Document

## Introduction

Great Comfort Agreement is a standalone web application for Great Comfort Services, a transportation company. It enables customers to electronically sign a Transportation Terms & Conditions agreement via a secure, customer-specific link. The application covers the full workflow: accessing a private agreement, reviewing terms, filling in passenger/trip information, accepting terms via checkbox, signing electronically, submitting, and receiving confirmation. Company staff receive an email notification with a PDF of the signed agreement, and all submissions are stored in Firebase Firestore. An admin dashboard provides authorized staff with full visibility into all submissions.

---

## Glossary

- **System**: The Great Comfort Agreement web application as a whole.
- **Customer**: A passenger who has been issued a unique secure link to sign their transportation agreement.
- **Admin**: An authorized Great Comfort Services staff member who accesses the admin dashboard.
- **Token**: A cryptographically random, unique identifier embedded in a customer's private URL that grants access to exactly one agreement.
- **Agreement**: The Transportation Terms & Conditions document associated with a specific customer's token.
- **Submission**: A completed, signed agreement record stored in Firestore.
- **Signature_Pad**: The HTML Canvas-based component that captures a customer's drawn signature.
- **PDF_Generator**: The server-side component (PDFKit or equivalent) that produces a PDF of the signed agreement.
- **Email_Service**: The component (SendGrid or Nodemailer) responsible for sending notification emails to Great Comfort Services.
- **Firestore**: The Firebase Firestore database used to persist agreement tokens, customer data, and submissions.
- **Admin_Dashboard**: The password-protected interface through which Admins view and manage submissions.
- **Terms_Version**: A semantic version string (e.g., "v1.0") identifying the specific revision of the Terms & Conditions a customer signed.

---

## Requirements

### Requirement 1: Secure Customer Access via Token Link

**User Story:** As a customer, I want to access my agreement via a private, unique URL, so that only I can view and sign my specific agreement.

#### Acceptance Criteria

1. THE System SHALL generate a cryptographically random token of at least 128 bits of entropy for each customer agreement.
2. WHEN a customer navigates to `/terms/{token}`, THE System SHALL load the agreement associated exclusively with that token.
3. WHEN a customer navigates to `/terms/{token}` and the token does not exist in Firestore, THE System SHALL display an error page with the message "This link is invalid or has expired."
4. WHEN a customer navigates to `/terms/{token}` and the associated agreement has already been submitted, THE System SHALL display a read-only confirmation view of the submitted agreement; WHEN the agreement has not yet been submitted, THE System SHALL display the editable agreement form.
5. THE System SHALL enforce HTTPS for all customer-facing and admin-facing routes.
6. THE System SHALL apply Firestore security rules that prevent any customer from reading or writing documents associated with a token other than their own.

---

### Requirement 2: Terms & Conditions Display

**User Story:** As a customer, I want to read the full Transportation Terms & Conditions before signing, so that I understand what I am agreeing to.

#### Acceptance Criteria

1. WHEN a customer loads a valid agreement page, THE System SHALL display all five terms sections in full: Trip Details, Round-Trip Waiting Policy, Safety and Wheelchair Acknowledgment, Passenger Responsibilities, and Cancellations and Reservation Changes.
2. THE System SHALL display the Terms_Version associated with the loaded agreement on the agreement page.
3. THE System SHALL record the Terms_Version string in the Submission document at the time of submission, preserving the version the customer actually read.
4. WHEN the Terms & Conditions content changes, THE System SHALL assign a new Terms_Version value and associate new tokens with the updated version, leaving existing tokens associated with their original version.
5. IF recording the Terms_Version in a Submission document fails, THEN THE System SHALL log the failure and SHALL allow the submission to proceed without the version data.

---

### Requirement 3: Passenger Information Form

**User Story:** As a customer, I want to review and complete my passenger and trip details, so that Great Comfort Services has accurate information for my trip.

#### Acceptance Criteria

1. THE System SHALL display a form containing the following fields: Passenger Name, Email, Phone Number, Trip Date, Pickup Location, and Destination.
2. WHEN a customer's agreement token has pre-filled data stored in Firestore, THE System SHALL populate the corresponding form fields with that data on page load.
3. THE System SHALL mark all six fields — Passenger Name, Email, Phone Number, Trip Date, Pickup Location, and Destination — as required.
4. WHEN a customer attempts to submit the form with one or more required fields empty, THE System SHALL display a field-level error message identifying each missing field and SHALL prevent submission.
5. WHEN a customer enters a value in the Email field, THE System SHALL validate that the value conforms to standard email address format (local-part@domain) and SHALL display an inline error if the format is invalid.
6. WHEN a customer enters a value in the Phone Number field, THE System SHALL validate that the value contains between 7 and 15 digits and SHALL display an inline error if the format is invalid.

---

### Requirement 4: Terms Acceptance Acknowledgment and Checkbox

**User Story:** As a customer, I want to explicitly confirm that I have read and understood the terms, so that my acceptance is unambiguous.

#### Acceptance Criteria

1. THE System SHALL display the following static acknowledgment text immediately above the acceptance checkbox, exactly as written: "By booking or using the transportation services provided by Great Comfort Services, I acknowledge that I have read, understood, and agree to the above Terms and Conditions."
2. THE System SHALL display a checkbox labeled exactly: "I have read, understood, and agree to the Terms and Conditions."
3. WHEN a customer attempts to submit the agreement without checking the acknowledgment checkbox, THE System SHALL display the error message "You must accept the Terms and Conditions to proceed." and SHALL prevent submission.
4. THE System SHALL record the acceptance state as a boolean `true` in the Submission document only when the checkbox is checked at submission time.

---

### Requirement 5: Electronic Signature Capture

**User Story:** As a customer, I want to sign the agreement using my mouse, finger, or stylus, so that I can provide a legally meaningful electronic signature on any device.

#### Acceptance Criteria

1. THE System SHALL render the Signature_Pad as an HTML Canvas element that accepts input from mouse events, touch events, and stylus events.
2. THE System SHALL display a "Clear" button that, when activated, erases all drawn content from the Signature_Pad canvas.
3. WHEN a customer attempts to submit the agreement without having drawn on the Signature_Pad, THE System SHALL display the error message "A signature is required." and SHALL prevent submission.
4. WHEN the customer submits a completed agreement, THE System SHALL capture the Signature_Pad canvas content as a PNG-format data URL at the moment the Submit button is activated and include it in the Submission document.
5. THE System SHALL render the Signature_Pad at a minimum canvas width of 300 pixels and minimum height of 150 pixels on all supported viewports.

---

### Requirement 6: Submission Validation and Processing

**User Story:** As a customer, I want clear feedback when my submission is complete or when something is missing, so that I know exactly what action to take.

#### Acceptance Criteria

1. WHEN a customer activates the Submit button, THE System SHALL validate that all required form fields are filled, the acknowledgment checkbox is checked, and the Signature_Pad contains a drawn signature before proceeding.
2. WHEN validation fails on submission, THE System SHALL display all applicable error messages simultaneously and SHALL scroll the viewport to the first error.
3. WHEN all validations pass, THE System SHALL record the submission timestamp automatically as both a Signed Date (YYYY-MM-DD) and Signed Time (HH:MM:SS UTC) without allowing the customer to modify these values.
4. WHEN all validations pass, THE System SHALL write a Submission document to Firestore containing: Submission ID, Customer Name, Email, Phone Number, Trip Date, Pickup Location, Destination, Signature (PNG data URL), Terms_Version, Accepted (boolean true), Signed Date, and Signed Time.
5. WHEN the Submission document has been successfully written to Firestore, THE System SHALL trigger PDF generation, email notification, and display of the confirmation page — in that order, with PDF generation and email notification completing asynchronously before the confirmation page is shown if technically feasible, or the confirmation page shown immediately with background processing otherwise.
6. IF writing the Submission document to Firestore fails, THEN THE System SHALL display the error message "Submission failed. Please try again." and SHALL NOT mark the agreement as submitted.

---

### Requirement 7: PDF Generation

**User Story:** As a Great Comfort Services staff member, I want a PDF copy of each signed agreement, so that I have a durable, printable record of every customer's commitment.

#### Acceptance Criteria

1. WHEN a Submission is completed, THE PDF_Generator SHALL produce a PDF document containing: the Great Comfort Services company name and branding, all five Terms & Conditions sections with the Terms_Version, all six customer information fields and their values, the electronic signature image, the Signed Date and Signed Time, and the footer text "Safety is our highest priority."
2. THE PDF_Generator SHALL produce a PDF that is machine-readable (text-selectable) for the terms and customer information fields.
3. WHEN PDF generation fails, THE System SHALL log the error and SHALL continue to send the email notification without a PDF attachment, including a note in the email body that PDF generation failed.
4. THE System SHALL store the generated PDF in Firebase Storage and record the storage path in the Submission document.

---

### Requirement 8: Email Notification

**User Story:** As a Great Comfort Services staff member, I want to receive an email whenever a customer signs an agreement, so that I can act on the booking immediately.

#### Acceptance Criteria

1. WHEN a Submission is completed, THE Email_Service SHALL send an email to the configured Great Comfort Services recipient address with the subject line: "New Signed Transportation Terms – {Customer Name}".
2. THE Email_Service SHALL include in the email body: Passenger Name, Email, Phone Number, Trip Date, Pickup Location, Destination, Terms_Version, accepted status, Signed Date, and Signed Time.
3. WHERE the PDF was generated successfully, THE Email_Service SHALL attach the PDF to the email.
4. IF the Email_Service fails to deliver the email, THEN THE System SHALL log the failure including the Submission ID. IF the failure logging itself fails, THEN THE System SHALL block display of the confirmation page and SHALL display an error message to the customer.

---

### Requirement 9: Confirmation Page

**User Story:** As a customer, I want to see a clear confirmation after submitting, so that I know my agreement has been received.

#### Acceptance Criteria

1. WHEN a Submission is successfully saved to Firestore, THE System SHALL navigate the customer to a confirmation page.
2. THE System SHALL display the following messages on the confirmation page:
   - "Thank You! Your Transportation Terms & Conditions have been successfully submitted."
   - "Your signed acknowledgment has been received by Great Comfort Services."
   - "Safety is our highest priority."
3. WHEN a customer navigates to the confirmation page directly without a completed submission, THE System SHALL redirect the customer to the home page.

---

### Requirement 10: Admin Dashboard — Authentication

**User Story:** As an Admin, I want to log in to a protected dashboard, so that only authorized Great Comfort Services staff can view customer submissions.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL require authentication via Firebase Authentication before displaying any submission data. THE System SHALL apply a client-side guard that hides all dashboard content if the authentication check is bypassed or fails to redirect.
2. WHEN an unauthenticated user navigates to any admin route, THE System SHALL redirect the user to the admin login page.
3. WHEN an Admin provides valid credentials, THE System SHALL grant access to the Admin_Dashboard.
4. WHEN an Admin provides invalid credentials, THE System SHALL display the error message "Invalid email or password." and SHALL not grant access.
5. THE System SHALL apply Firestore security rules that restrict read access to the submissions collection exclusively to authenticated Admin accounts.

---

### Requirement 11: Admin Dashboard — Submissions Table

**User Story:** As an Admin, I want to see a list of all signed agreements, so that I can quickly find and review any customer's submission.

#### Acceptance Criteria

1. WHEN an authenticated Admin loads the Admin_Dashboard, THE System SHALL display a table listing all Submissions with at minimum the columns: Passenger Name, Trip Date, and Status. IF the submissions table fails to render due to a system error or data issue, THEN THE System SHALL display an error message and SHALL prevent the dashboard from loading until the table can be displayed.
2. THE System SHALL display Submissions in the table sorted by Signed Date in descending order by default.
3. WHEN an Admin activates a row in the submissions table, THE System SHALL navigate to the detail view for that Submission.

---

### Requirement 12: Admin Dashboard — Search and Filter

**User Story:** As an Admin, I want to search and filter the submissions list, so that I can quickly locate a specific customer's agreement without scrolling through all records.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display a search input field above the submissions table that filters displayed rows in real time as the Admin types.
2. THE System SHALL match the search query against at least the following fields: Passenger Name, Email, Phone Number, Trip Date, Pickup Location, and Destination — and SHALL display any row where at least one of those fields contains the query string (case-insensitive).
3. WHEN the search input is empty, THE System SHALL display all submissions (subject to the default sort order of Requirement 11.2).
4. WHEN no submissions match the current search query, THE System SHALL display a message such as "No submissions match your search." in place of the table rows.
5. THE System SHALL perform search filtering client-side on the already-loaded submissions list; a new API request is NOT required for each keystroke.
6. THE System SHALL preserve the descending Signed Date sort order (Requirement 11.2) when filtering results.

---

### Requirement 13: Admin Dashboard — Submission Detail View

**User Story:** As an Admin, I want to see the full details of a specific signed agreement, so that I can verify passenger information and access the signed document.

#### Acceptance Criteria

1. WHEN an Admin navigates to a Submission detail view, THE System SHALL display all stored fields: Passenger Name, Email, Phone Number, Trip Date, Pickup Location, Destination, Terms_Version, Accepted status, Signed Date, Signed Time, and the signature image.
2. THE System SHALL display a "View PDF" button that opens the generated PDF in a new browser tab, independent of whether the "Download PDF" button is also displayed.
3. THE System SHALL display a "Download PDF" button that triggers a browser download of the generated PDF, independent of whether the "View PDF" button is also displayed.
4. WHEN the PDF for a Submission is not available, THE System SHALL hide the View PDF and Download PDF buttons and SHALL display a message indicating the PDF is unavailable.

---

### Requirement 14: Data Immutability

**User Story:** As Great Comfort Services, I want signed agreements to be immutable after submission, so that the integrity of each customer's signed record is preserved.

#### Acceptance Criteria

1. WHEN a Submission document has been written to Firestore, THE System SHALL apply Firestore security rules that prevent any client-side update or deletion of that document.
2. THE System SHALL allow only server-side administrative operations (performed via Firebase Admin SDK) to modify or delete Submission documents.
3. WHEN a customer returns to a previously submitted agreement URL, THE System SHALL display a read-only view of the submission and SHALL NOT present the editable form.
