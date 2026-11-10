# Camera attendance and student verification

The default app uses AttendPro's existing local account and `localStorage`
architecture. The explicitly enabled staging Auth mode instead uses the
authenticated Supabase session and shared attendance RPCs. Neither mode uses
Supabase Storage for camera images.

## Registration and verification

1. Select **Student** or **Staff** on the login page and create an account with
   a valid email address and password. Registration does not send email or sign
   in automatically. Email confirmation is not required.
2. Student registration collects a roll number, department, year, and section.
   The student's **Student Verification** page allows them to submit those
   details for staff review. Name and email are populated from the account.
3. If desired, the student can start the camera to see local face-presence
   indicators. This is not identity proof and is not required to submit details.
4. Staff review requests under **Staff → Students**. Approval marks the student
   verified; rejection leaves a review note and lets the student resubmit.

Roll numbers are checked for uniqueness within a case-insensitive
department/year/section combination. Student identity fields, verification
status, and review metadata are saved in the student's existing profile record.
The app does not capture or retain verification photographs. Staff review the
submitted academic details and perform identity checks outside automated face
detection.

## Subject enrollment and staff visibility

The staff **Students** page lists every student account available in the current
browser separately from the per-subject attendance roster. Selecting a staff
subject shows whether each student has enrolled in it and allows filtering by
department, year, and section. Staff subject assignments do not enroll students.
Students must add the subject to their own account; matching uses a normalized
subject code (case, spaces, and punctuation are ignored), with subject-name
matching only as a legacy fallback when a code is missing. Do not create a
student subject just to make the student appear in every staff roster.

The local account system stores accounts and enrollment on a single browser
profile. A student registered on another device is not visible to local staff
until the application uses an explicitly configured shared account/enrollment
service; the legacy attendance sync is not the local authentication system.

## Staff camera workflow

1. In local mode, staff and student accounts must be available in the same
   browser profile. Staff manage local subject assignments in **Profile**.
   In staging Auth, the staff subject assignment must be provisioned by a
   platform administrator, and the student must enroll in that subject.
2. Open **Staff → Attendance**, choose a subject and (in local mode) a session
   date. In staging Auth, choose an open, unexpired shared session for the
   subject; create one in **Live Attendance** if needed.
3. Start the camera. The browser requests webcam permission.
4. Face detection displays boxes and a count only; it never identifies people.
   Staff visually identify students by comparing people in the room to the
   verified subject roster and manually select their names.
5. Staff review the selected names and roll numbers, then explicitly confirm
   attendance. Only verified students can be selected or confirmed.
6. Local mode writes to the local record and subject counters and prevents a
   duplicate student/subject/date entry. Staging Auth submits the selected
   Auth-linked student identity to `confirm_camera_attendance`; the database
   validates the staff assignment, enrollment, verified status, open session,
   and duplicate attendance for that session.

## Camera privacy and limitations

Camera access requires HTTPS or `localhost` and browser permission. Start and
stop the camera from the panel; stopping it releases the webcam and face
detector. Permission denial, missing devices, and unavailable face detection
are reported in the interface. Face detection runs locally in the browser. No
facial recognition, templates, biometric profiles, frame capture, or camera
uploads are implemented.

In local mode, `localStorage` is specific to one browser profile and device.
Accounts, verification records, subject enrollment, and attendance do not
automatically synchronize across devices. A browser-local staff account can
approve records in that browser, but client-stored roles and data are editable
by the device user. Passwords are stored as salted PBKDF2-SHA-256 hashes, never
plaintext; this is still not secure production authentication or
authorization. Do not use browser-local accounts to protect sensitive or
production records.

Existing local accounts and data are not imported when staging Auth is enabled.
Local-mode camera attendance remains browser/device-specific; staging camera
attendance uses the shared database only after the staging migrations and
server configuration are applied. Face presence is not identity proof.
