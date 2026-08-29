/**
 * PlanWise Signup Page
 *
 * Standalone page (opened from the popup's "Sign up" button) instead of the
 * old cramped inline form in the popup's small auth screen.
 */

const Auth = window.SupabaseClient.auth;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

// Not too strict on purpose: length + a letter + a number, no symbol/case
// requirements. Longer minimum than Supabase's own default (6) rather than
// piling on complexity rules, which is the direction most modern password
// guidance (e.g. NIST) actually leans.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_HAS_LETTER = /[A-Za-z]/;
const PASSWORD_HAS_NUMBER = /\d/;

function passwordError(password) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!PASSWORD_HAS_LETTER.test(password) || !PASSWORD_HAS_NUMBER.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

const usernameInput  = el('signup-username');
const usernameStatus = el('username-status');
const emailInput     = el('signup-email');
const emailStatus    = el('email-status');
const passwordInput  = el('signup-password');
const confirmInput   = el('signup-confirm');
const form           = el('signup-form');
const submitBtn      = el('btn-signup-submit');

let usernameCheckToken = 0;
let emailCheckToken = 0;

usernameInput.addEventListener('blur', checkUsernameLive);
usernameInput.addEventListener('input', () => {
  usernameStatus.textContent = '';
  usernameStatus.className = 'text-xs font-mono min-h-[1em]';
});

emailInput.addEventListener('blur', checkEmailLive);
emailInput.addEventListener('input', () => {
  emailStatus.textContent = '';
  emailStatus.className = 'text-xs font-mono min-h-[1em]';
});

async function checkUsernameLive() {
  const username = usernameInput.value.trim();
  if (!username) return;

  if (!USERNAME_PATTERN.test(username)) {
    usernameStatus.textContent = '3-20 characters, letters/numbers/underscore only.';
    usernameStatus.className = 'text-xs font-mono min-h-[1em] text-error';
    return;
  }

  const token = ++usernameCheckToken;
  usernameStatus.textContent = 'Checking...';
  usernameStatus.className = 'text-xs font-mono min-h-[1em] text-on-muted';

  try {
    const available = await Auth.checkUsernameAvailable(username);
    if (token !== usernameCheckToken) return; // a newer check superseded this one
    usernameStatus.textContent = available ? '✓ Available' : '✗ Already taken';
    usernameStatus.className = 'text-xs font-mono min-h-[1em] ' + (available ? 'text-status-ok' : 'text-error');
  } catch (err) {
    if (token !== usernameCheckToken) return;
    console.warn('[PlanWise] Username availability check failed:', err.message);
    usernameStatus.textContent = '';
  }
}

async function checkEmailLive() {
  const email = emailInput.value.trim();
  if (!email || !emailInput.checkValidity()) return;

  const token = ++emailCheckToken;
  emailStatus.textContent = 'Checking...';
  emailStatus.className = 'text-xs font-mono min-h-[1em] text-on-muted';

  try {
    const available = await Auth.checkEmailAvailable(email);
    if (token !== emailCheckToken) return; // a newer check superseded this one
    emailStatus.textContent = available ? '✓ Available' : '✗ Already registered';
    emailStatus.className = 'text-xs font-mono min-h-[1em] ' + (available ? 'text-status-ok' : 'text-error');
  } catch (err) {
    if (token !== emailCheckToken) return;
    console.warn('[PlanWise] Email availability check failed:', err.message);
    emailStatus.textContent = '';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  setSuccess('');

  const username = usernameInput.value.trim();
  const email    = emailInput.value.trim();
  const password = passwordInput.value;
  const confirm  = confirmInput.value;

  if (!USERNAME_PATTERN.test(username)) {
    setError('Username must be 3-20 characters, letters/numbers/underscore only.');
    return;
  }
  if (!email) {
    setError('Email is required.');
    return;
  }
  const pwError = passwordError(password);
  if (pwError) {
    setError(pwError);
    return;
  }
  if (password !== confirm) {
    setError('Passwords do not match.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Checking username...';

  try {
    const usernameAvailable = await Auth.checkUsernameAvailable(username);
    if (!usernameAvailable) {
      setError('That username is already taken.');
      return;
    }

    submitBtn.textContent = 'Checking email...';
    const emailAvailable = await Auth.checkEmailAvailable(email);
    if (!emailAvailable) {
      setError('That email is already registered. Try signing in instead.');
      return;
    }

    submitBtn.textContent = 'Creating account...';
    await Auth.signUp(email, password, username);

    form.classList.add('hidden');
    setSuccess('✓ Account created! Check your email to confirm, then close this tab and sign in from the PlanWise icon.');
  } catch (err) {
    setError(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
  }
});

function setError(msg) {
  const p = el('signup-error');
  p.textContent = msg;
  msg ? p.classList.remove('hidden') : p.classList.add('hidden');
}

function setSuccess(msg) {
  const p = el('signup-success');
  p.textContent = msg;
  msg ? p.classList.remove('hidden') : p.classList.add('hidden');
}

function el(id) { return document.getElementById(id); }
