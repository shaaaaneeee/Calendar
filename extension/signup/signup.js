/**
 * PlanWise Signup Page
 *
 * Standalone page (opened from the popup's "Sign up" button) instead of the
 * old cramped inline form in the popup's small auth screen.
 */

const Auth = window.SupabaseClient.auth;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

const usernameInput  = el('signup-username');
const usernameStatus = el('username-status');
const emailInput     = el('signup-email');
const passwordInput  = el('signup-password');
const confirmInput   = el('signup-confirm');
const form           = el('signup-form');
const submitBtn      = el('btn-signup-submit');

let usernameCheckToken = 0;

usernameInput.addEventListener('blur', checkUsernameLive);
usernameInput.addEventListener('input', () => {
  usernameStatus.textContent = '';
  usernameStatus.className = 'text-xs font-mono min-h-[1em]';
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
  if (password.length < 6) {
    setError('Password must be at least 6 characters.');
    return;
  }
  if (password !== confirm) {
    setError('Passwords do not match.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Checking username...';

  try {
    const available = await Auth.checkUsernameAvailable(username);
    if (!available) {
      setError('That username is already taken.');
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
