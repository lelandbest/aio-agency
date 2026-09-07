import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Chrome, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, RefreshCw } from 'lucide-react';
import { AuthService } from '../services/auth.service';
import { storeSessionToken } from '../services/authStorage';
import { openOAuthPopup } from '../utils/oauthPopup';

const initialStatus = {
  hasUsers: false,
  canBootstrapOwner: true,
  googleOauthAvailable: false,
};

const AuthScreen = ({ onLogin }) => {
  const [status, setStatus] = useState(initialStatus);
  const [mode, setMode] = useState('login'); // 'login' | 'bootstrap' | 'forgot' | 'reset'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [generatedResetToken, setGeneratedResetToken] = useState('');

  const isBootstrap = mode === 'bootstrap' || (!status.hasUsers && mode !== 'forgot' && mode !== 'reset');

  const checkStatus = async () => {
    setLoading(true);
    setError('');
    let attempts = 0;
    const maxAttempts = 25; // Poll for up to 12.5 seconds while the backend starts
    let response = null;

    while (attempts < maxAttempts) {
      try {
        response = await AuthService.getAuthStatus();
        setStatus(response);
        setError('');
        if (!response.hasUsers) {
          setMode('bootstrap');
        } else if (mode === 'bootstrap' && response.hasUsers) {
          setMode('login');
        }
        break;
      } catch (loadError) {
        attempts++;
        if (attempts >= maxAttempts) {
          setError(loadError.message || 'Unable to connect to the local background engine.');
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!response) {
      setLoading(false);
      return;
    }

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get('token') || urlParams.get('reset_token');
      if (tokenFromUrl) {
        setResetToken(tokenFromUrl);
        setMode('reset');
        try {
          const val = await AuthService.validateResetToken(tokenFromUrl);
          if (val?.email) {
            setEmail(val.email);
          }
        } catch (valErr) {
          setError(valErr.message || 'Invalid or expired password reset token.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const title = useMemo(() => {
    if (mode === 'forgot') return 'Reset Password';
    if (mode === 'reset') return 'Set New Password';
    return isBootstrap ? 'Create Owner Account' : 'AIO Nexus Login';
  }, [isBootstrap, mode]);

  const subtitle = useMemo(() => {
    if (mode === 'forgot') return 'Enter your email address to receive password recovery instructions.';
    if (mode === 'reset') return 'Enter your new account password below.';
    return isBootstrap
      ? 'Bootstrap the primary owner account for this local installation.'
      : 'Sign in to the local command center.';
  }, [isBootstrap, mode]);

  const finishLogin = (session) => {
    if (session?.token) {
      storeSessionToken(session.token);
    }
    onLogin(session);
  };

  const handleLocalSubmit = async (event) => {
    event.preventDefault();
    if (isBootstrap) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (confirmPassword && password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    setError('');
    setSuccessMessage('');
    try {
      const session = isBootstrap
        ? await AuthService.bootstrapOwner({ name: name.trim() || email.split('@')[0], email, password })
        : await AuthService.login({ email, password });
      finishLogin(session);
    } catch (authError) {
      setError(authError.message || (isBootstrap ? 'Failed to create owner account.' : 'Unable to sign in.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMessage('');
    setGeneratedResetToken('');

    try {
      const res = await AuthService.forgotPassword(email);
      setSuccessMessage(res?.message || 'Instructions have been sent if an account exists with that email.');
      if (res?.resetToken) {
        setGeneratedResetToken(res.resetToken);
      }
    } catch (err) {
      setError(err.message || 'Failed to request password reset.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (event) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const res = await AuthService.resetPassword({ token: resetToken, newPassword: password });
      setSuccessMessage(res?.message || 'Password reset successfully! You may now sign in.');
      setMode('login');
      setPassword('');
      setConfirmPassword('');
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      setError(err.message || 'Unable to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = await openOAuthPopup(AuthService.getGoogleAppAuthorizeUrl(), 'auth');
      if (!payload?.session) {
        throw new Error('Google sign-in did not return a session.');
      }
      finishLogin(payload.session);
    } catch (authError) {
      setError(authError.message || 'Google sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-md rounded-xl border border-[#27272A] bg-[#0F0F11] p-8 shadow-2xl">
        <div className="mb-6 flex justify-center">
          <img
            src="/aio-button-192px.png"
            alt="AIO Nexus"
            className="h-20 w-20 rounded-full object-cover shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
          />
        </div>

        <h2 className="mb-2 text-center text-2xl font-bold">{title}</h2>
        <p className="mb-8 text-center text-sm text-gray-500">{subtitle}</p>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-8 text-sm text-gray-300">
            <LoaderCircle size={22} className="animate-spin text-blue-500" />
            <p className="font-medium">Connecting to local engine...</p>
            <p className="text-xs text-gray-500">Starting background services</p>
          </div>
        ) : error && !status.hasUsers && !status.canBootstrapOwner && error.includes('engine') ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              <p className="font-semibold mb-1">Local Backend Connection Issue</p>
              <p className="text-xs text-red-400">{error}</p>
            </div>
            <button
              onClick={() => checkStatus()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#27272A] hover:bg-[#3f3f46] py-3 text-sm font-semibold text-white transition"
            >
              <RefreshCw size={16} />
              Retry Connection
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {successMessage ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-start gap-3">
                <CheckCircle2 size={20} className="shrink-0 text-emerald-400 mt-0.5" />
                <div>
                  <p className="font-semibold">{successMessage}</p>
                  {generatedResetToken ? (
                    <div className="mt-3 pt-3 border-t border-emerald-500/20">
                      <p className="text-xs text-emerald-200 mb-2">Local Dev Mode: Instant Reset Link generated</p>
                      <button
                        onClick={() => {
                          setResetToken(generatedResetToken);
                          setMode('reset');
                          setSuccessMessage('');
                        }}
                        className="flex items-center gap-2 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition"
                      >
                        <KeyRound size={14} />
                        Proceed to Reset Password
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {isBootstrap ? (
              /* ── BOOTSTRAP: FIRST-TIME OWNER SETUP FORM ── */
              <form onSubmit={handleLocalSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">Owner / Organization Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Primary Owner"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">Owner Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                    placeholder="admin@aiocrm.local"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">Create Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Repeat password"
                    required
                    minLength={8}
                  />
                </div>

                {error ? <div className="rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div> : null}

                <div className="rounded-lg border border-[#27272A] bg-[#14161a] px-4 py-3 text-xs text-gray-400">
                  <div className="flex items-center gap-2 font-semibold text-gray-300">
                    <ShieldCheck size={14} className="text-blue-400" />
                    First-Run Owner Setup
                  </div>
                  <div className="mt-2 text-gray-400 leading-relaxed">
                    This first account becomes the local owner with complete administrative control over this AIO Nexus installation.
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating Owner Account...' : 'Create Owner Account'}
                </button>

                {status.hasUsers ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setMode('login');
                    }}
                    className="flex w-full items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white transition"
                  >
                    Already have an account? Sign In
                  </button>
                ) : null}
              </form>
            ) : mode === 'login' ? (
              /* ── REGULAR SIGN-IN FORM ── */
              <>
                {status.googleOauthAvailable ? (
                  <>
                    <button
                      onClick={handleGoogleLogin}
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-3 font-bold text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Chrome size={18} />
                      Continue with Google
                    </button>

                    <div className="relative flex items-center py-2">
                      <div className="flex-grow border-t border-[#27272A]" />
                      <span className="mx-4 flex-shrink-0 text-xs uppercase text-gray-500">Or</span>
                      <div className="flex-grow border-t border-[#27272A]" />
                    </div>
                  </>
                ) : null}

                <form onSubmit={handleLocalSubmit} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                      placeholder="owner@aiocrm.local"
                      required
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400">Password</label>
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setSuccessMessage('');
                          setMode('forgot');
                        }}
                        className="text-xs font-semibold text-blue-400 hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                      placeholder="••••••••"
                      required
                    />
                  </div>

                  {error ? <div className="rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div> : null}

                  <div className="rounded-lg border border-[#27272A] bg-[#14161a] px-4 py-3 text-xs text-gray-400">
                    <div className="flex items-center gap-2 font-semibold text-gray-300">
                      <LockKeyhole size={14} />
                      Local Account Access
                    </div>
                    <div className="mt-2 text-gray-400">
                      Sign in with your local owner credentials or an approved user account.
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Authenticating...' : 'Sign In'}
                  </button>

                  {status.canBootstrapOwner ? (
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setMode('bootstrap');
                      }}
                      className="flex w-full items-center justify-center gap-2 py-2 text-sm text-blue-400 hover:text-blue-300 transition font-medium"
                    >
                      First time here? Set up owner account
                    </button>
                  ) : null}
                </form>
              </>
            ) : mode === 'forgot' ? (
              /* ── FORGOT PASSWORD FORM ── */
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">Account Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                    placeholder="support@aiocrm.org"
                    required
                  />
                </div>

                {error ? <div className="rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div> : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Sending Request...' : 'Send Recovery Instructions'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setSuccessMessage('');
                    setMode(status.hasUsers ? 'login' : 'bootstrap');
                  }}
                  className="flex w-full items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white transition"
                >
                  <ArrowLeft size={16} />
                  Back to Sign In
                </button>
              </form>
            ) : mode === 'reset' ? (
              /* ── RESET PASSWORD FORM ── */
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">Account Email</label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full rounded-lg border border-[#27272A] bg-[#14161a] px-4 py-3 text-gray-400 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Repeat new password"
                    required
                    minLength={8}
                  />
                </div>

                {error ? <div className="rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div> : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Updating Password...' : 'Reset & Save Password'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setSuccessMessage('');
                    setMode(status.hasUsers ? 'login' : 'bootstrap');
                  }}
                  className="flex w-full items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white transition"
                >
                  <ArrowLeft size={16} />
                  Back to Sign In
                </button>
              </form>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
