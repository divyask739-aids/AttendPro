# Camera attendance and student verification

Student and staff accounts use AttendPro's existing local account and
`localStorage` architecture. Camera attendance writes to the existing student
attendance records and subject counters; it does not use Supabase Auth,
database queries, RPCs, or storage.

## Registration and verification

1. Select **Student** or **Staff** on the login page and create an account with
   an email address and password. Registration does not send email or sign in
   automatically.
2. Student registration collects a roll number, department, year, and section.
   The student's **Student Verification** page allows them to submit those
   details for staff review.
3. Staff review requests under **Staff → Students**. Approval marks the student
   verified; rejection leaves a review note and lets the student resubmit.
4. A QR code containing only the student's internal ID is available on the
   verification page after staff approval.

Roll numbers are checked for uniqueness within a case-insensitive
department/year/section combination. Student identity fields and verification
status are saved in the student's existing profile record.

## Staff camera workflow

1. Staff and student accounts must be available in the same browser profile.
   Staff can add their subject assignments in **Profile**; students must be
   enrolled in a matching subject.
2. Open **Staff → Attendance**, choose a subject and attendance date, and
   start the camera. The browser requests webcam permission.
3. Face detection displays boxes and a count only. QR scanning looks up an
   existing student in the selected subject roster and displays the student's
   name, ID, roll number, department, and verification status.
4. Only verified students can be selected. Staff must visually verify each
   student and explicitly confirm attendance.
5. Attendance is written to the student's existing local record and subject
   counters. A student/subject/date combination can be recorded only once.

## Camera privacy and limitations

Camera access requires HTTPS or `localhost` and browser permission. Start and
stop the camera from the panel; stopping it releases the webcam and face
detector. Permission denial, missing devices, and unavailable face detection
are reported in the interface. Face detection and QR scanning run locally in
the browser. No facial recognition, templates, biometric profiles, frame
capture, or camera uploads are implemented.

`localStorage` is specific to one browser profile and device. Accounts,
verification records, subject enrollment, and attendance do not automatically
synchronize across devices. A browser-local staff account can approve records
in that browser, but client-stored roles and data are editable by the device
user. Passwords are stored as salted PBKDF2-SHA-256 hashes, never plaintext;
this is still not a secure production authentication or authorization backend.
Do not use browser-local accounts to protect sensitive or production records.
Password reset and email verification are not configured.

Existing Supabase accounts cannot be transparently converted because this
browser-only flow cannot verify or import server-side password credentials.
The repository retains separate legacy shared-attendance code; this camera
workflow uses only local student profiles and local attendance storage.
