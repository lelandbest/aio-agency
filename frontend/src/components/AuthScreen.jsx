import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Chrome, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import { AuthService } from '../services/auth.service';
import { storeSessionToken } from '../services/authStorage';
import { openOAuthPopup } from '../utils/oauthPopup';

const initialStatus = {
  hasUsers: false,
  canBootstrapOwner: false,
  googleOauthAvailable: false,
};

const AuthScreen = ({ onLogin }) => {
  const [status, setStatus] = useState(initialStatus);
  const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'reset'
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

  const isBootstrap = !status.hasUsers && status.canBootstrapOwner;

  useEffect(() => {
    let cancelled = false;

    const loadStatusAndCheckToken = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await AuthService.getAuthStatus();
        if (!cancelled) {
          setStatus(response);
        }

        // Check for reset token in URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token') || urlParams.get('reset_token');
        if (tokenFromUrl && !cancelled) {
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
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Unable to reach the local backend.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadStatusAndCheckToken();
    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(() => {
    if (mode === 'forgot') return 'Reset Password';
    if (mode === 'reset') return 'Set New Password';
    return isBootstrap ? 'Create Owner Access' : 'AIO CRM Login';
  }, [isBootstrap, mode]);

  const subtitle = useMemo(() => {
    if (mode === 'forgot') return 'Enter your email address to receive password recovery instructions.';
    if (mode === 'reset') return 'Enter your new account password below.';
    return isBootstrap
      ? 'Bootstrap the first owner account for this local install.'
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
    setSubmitting(true);
    setError('');
    setSuccessMessage('');
    try {
      const session = isBootstrap
        ? await AuthService.bootstrapOwner({ name, email, password })
        : await AuthService.login({ email, password });
      finishLogin(session);
    } catch (authError) {
      setError(authError.message || 'Unable to sign in.');
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
      // Clean URL params
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
            alt="AIO CRM"
            className="h-20 w-20 rounded-full object-cover shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
          />
        </div>

        <h2 className="mb-2 text-center text-2xl font-bold">{title}</h2>
        <p className="mb-8 text-center text-sm text-gray-500">{subtitle}</p>

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-4 text-sm text-gray-300">
            <LoaderCircle size={18} className="animate-spin" />
            Checking local auth status...
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

            {mode === 'login' ? (
              <>
                <button
                  onClick={handleGoogleLogin}
                  disabled={submitting || !status.googleOauthAvailable}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-3 font-bold text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Chrome size={18} />
                  {status.googleOauthAvailable ? 'Continue with Google' : 'Google Sign-In Not Configured'}
                </button>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-[#27272A]" />
                  <span className="mx-4 flex-shrink-0 text-xs uppercase text-gray-500">Or</span>
                  <div className="flex-grow border-t border-[#27272A]" />
                </div>

                <form onSubmit={handleLocalSubmit} className="space-y-4">
                  {isBootstrap ? (
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">Owner Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                        placeholder="Best Studios"
                        required
                      />
                    </div>
                  ) : null}

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
                      <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                        {isBootstrap ? 'Create Password' : 'Password'}
                      </label>
                      {!isBootstrap ? (
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
                      ) : null}
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-lg border border-[#27272A] bg-[#18181B] px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                      placeholder="........"
                      required
                    />
                  </div>

                  {error ? <div className="rounded bg-red-500/10 p-3 text-sm text-red-400">{error}</div> : null}

                  <div className="rounded-lg border border-[#27272A] bg-[#14161a] px-4 py-3 text-xs text-gray-400">
                    <div className="flex items-center gap-2 font-semibold text-gray-300">
                      {isBootstrap ? <ShieldCheck size={14} /> : <LockKeyhole size={14} />}
                      {isBootstrap ? 'First-run bootstrap' : 'Local account access'}
                    </div>
                    <div className="mt-2">
                      {isBootstrap
                        ? 'The first account created here becomes the local owner for this installation.'
                        : 'Use the owner account credentials or an approved Google identity tied to an existing account.'}
                    </div>
                  </div>

                  <button
                    disabled={submitting}
                    className="w-full rounded-lg bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Authenticating...' : isBootstrap ? 'Create Owner Account' : 'Sign In'}
                  </button>
                </form>
              </>
            ) : mode === 'forgot' ? (
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
                    setMode('login');
                  }}
                  className="flex w-full items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-white transition"
                >
                  <ArrowLeft size={16} />
                  Back to Sign In
                </button>
              </form>
            ) : mode === 'reset' ? (
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
                    setMode('login');
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
