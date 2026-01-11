import React, { useState } from 'react';
import { Chrome } from 'lucide-react';
import { mockSupabase } from '../services/mockSupabase';

/**
 * AuthScreen Component
 * Handles user login with email/password or OAuth
 * Uses mock Supabase service (ready to swap with real Supabase)
 */
const AuthScreen = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: authError } = await mockSupabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    else onLogin(data.session);
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const { data, error: authError } = await mockSupabase.auth.signInWithOAuth({ provider: 'google' });
    if (authError) setError(authError.message);
    else {
      setTimeout(() => onLogin(data.session || { user: { email: 'google-user@aio.com' } }), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 font-sans text-white">
      <div className="w-full max-w-md bg-[#0F0F11] border border-[#27272A] rounded-xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6"><div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center font-bold text-xl">A</div></div>
        <h2 className="text-2xl font-bold text-center mb-2">AIO Agency Login</h2>
        <p className="text-gray-500 text-center mb-8 text-sm">Enter your credentials to access the command center.</p>
        <div className="space-y-4">
          <button onClick={handleGoogleLogin} disabled={loading} className="w-full bg-white text-black font-bold py-3 rounded-lg transition hover:bg-gray-200 flex items-center justify-center gap-2"><Chrome size={18} /> Sign in with Google</button>
          <div className="relative flex py-2 items-center"><div className="flex-grow border-t border-[#27272A]"></div><span className="flex-shrink-0 mx-4 text-gray-500 text-xs uppercase">Or</span><div className="flex-grow border-t border-[#27272A]"></div></div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-[#18181B] border border-[#27272A] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500" placeholder="producer@aio.com" /></div>
            <div><label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-[#18181B] border border-[#27272A] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500" placeholder="••••••••" /></div>
            {error && <div className="text-red-500 text-sm bg-red-500/10 p-3 rounded">{error}</div>}
            <div className="text-xs text-center text-gray-600">Preview Mode: Use <span className="text-purple-400">Any Email</span></div>
            <button disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition disabled:opacity-50">{loading ? 'Authenticating...' : 'Sign In'}</button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
