---
status: in-progress
kind: quick
---

# Frontend Signup

Add a frontend account creation path to the existing login page so new users can start signup, enter the verification OTP, and then sign in.

## Steps

- Add frontend API helpers for `signup/start` and `signup/finish`.
- Add signup mode and verification state to the login page.
- Keep existing `/login` routing and authenticated redirect behavior.
- Run frontend build.
