import React, { useEffect, useMemo, useState } from 'react';
import { Chrome, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import {
  bootstrapOwnerApi,
  getAuthStatusApi,
  getGoogleAppAuthorizeUrl,
  loginApi,
} from '../services/backendApi';
import { storeSessionToken } from '../services/authStorage';
import { openOAuthPopup } from '../utils/oauthPopup';

const initialStatus = {
  hasUsers: false,
  canBootstrapOwner: false,
  googleOauthAvailable: false,
};

const AuthScreen = ({ onLogin }) => {
  const [status, setStatus] = useState(initialStatus);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isBootstrap = !status.hasUsers && status.canBootstrapOwner;

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await getAuthStatusApi();
        if (!cancelled) {
          setStatus(response);
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

    loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const title = useMemo(() => (
    isBootstrap ? 'Create Owner Access' : 'AIO CRM Login'
  ), [isBootstrap]);

  const subtitle = useMemo(() => (
    isBootstrap
      ? 'Bootstrap the first owner account for this local install.'
      : 'Sign in to the local command center.'
  ), [isBootstrap]);

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
    try {
      const session = isBootstrap
        ? await bootstrapOwnerApi({ name, email, password })
        : await loginApi({ email, password });
      finishLogin(session);
    } catch (authError) {
      setError(authError.message || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = await openOAuthPopup(getGoogleAppAuthorizeUrl(), 'auth');
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
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">
                  {isBootstrap ? 'Create Password' : 'Password'}
                </label>
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
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
