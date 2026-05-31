import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import {
  Shield, Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Password strength logic
// ---------------------------------------------------------------------------

const getPasswordRules = (password) => [
  { label: 'At least 8 characters', met: password.length >= 8 },
  { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
  { label: 'One number', met: /\d/.test(password) },
];

const getStrengthLevel = (rules) => {
  const metCount = rules.filter((r) => r.met).length;
  if (metCount === 0) return null;
  if (metCount === 1) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' };
  if (metCount === 2) return { label: 'Fair', color: 'bg-amber-500', width: 'w-2/3' };
  return { label: 'Strong', color: 'bg-green-500', width: 'w-full' };
};

function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signup } = useAuth();
  const navigate = useNavigate();

  const passwordRules = getPasswordRules(password);
  const strengthLevel = getStrengthLevel(passwordRules);
  const allRulesMet = passwordRules.every((r) => r.met);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const passwordsMismatch = confirmPassword && password !== confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!allRulesMet) {
      setError('Please meet all password requirements.');
      return;
    }
    if (!confirmPassword) {
      setError('Please confirm your password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await signup(name.trim(), email.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Account creation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white border border-[#DDD3C5] flex items-center justify-center mx-auto mb-5 shadow-soft">
            <Shield className="w-7 h-7 text-accent-primary" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Create Account
          </h1>
          <p className="text-text-secondary text-sm">
            Join SafeRoute AI for safer travels
          </p>
        </div>

        {/* Form */}
        <div className="glass-card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl bg-danger-soft border border-danger/20 text-danger text-sm font-medium"
              >
                {error}
              </motion.div>
            )}

            {/* Full Name */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="your name"
                  autoComplete="name"
                  disabled={loading}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white/80 border border-[#DDD3C5] text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all disabled:opacity-60"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={loading}
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white/80 border border-[#DDD3C5] text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all disabled:opacity-60"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full pl-11 pr-12 py-3.5 rounded-2xl bg-white/80 border border-[#DDD3C5] text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength bar + rules — shown only when user starts typing */}
              {password && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 space-y-2.5"
                >
                  {/* Strength bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-[#EDE5DA] overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full transition-all duration-300 ${strengthLevel?.color || ''}`}
                        animate={{ width: strengthLevel?.width || '0%' }}
                      />
                    </div>
                    {strengthLevel && (
                      <span className={`text-xs font-medium ${
                        strengthLevel.label === 'Strong' ? 'text-green-600' :
                        strengthLevel.label === 'Fair' ? 'text-amber-600' :
                        'text-red-500'
                      }`}>
                        {strengthLevel.label}
                      </span>
                    )}
                  </div>

                  {/* Rules */}
                  <div className="space-y-1">
                    {passwordRules.map((rule) => (
                      <div key={rule.label} className="flex items-center gap-2">
                        {rule.met ? (
                          <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-text-muted shrink-0" />
                        )}
                        <span className={`text-xs ${rule.met ? 'text-green-700' : 'text-text-muted'}`}>
                          {rule.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  disabled={loading}
                  className={`w-full pl-11 pr-12 py-3.5 rounded-2xl bg-white/80 border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-4 transition-all disabled:opacity-60 ${
                    passwordsMismatch
                      ? 'border-danger/50 focus:border-danger/50 focus:ring-danger/10'
                      : passwordsMatch
                      ? 'border-green-500/50 focus:border-green-500/50 focus:ring-green-500/10'
                      : 'border-[#DDD3C5] focus:border-accent-primary/50 focus:ring-accent-primary/10'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Match feedback */}
              {confirmPassword && (
                <p className={`text-xs mt-1.5 flex items-center gap-1.5 ${
                  passwordsMatch ? 'text-green-600' : 'text-danger'
                }`}>
                  {passwordsMatch ? (
                    <><Check className="w-3 h-3" /> Passwords match</>
                  ) : (
                    <><X className="w-3 h-3" /> Passwords do not match</>
                  )}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  Create Account
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#DDD3C5] text-center">
            <p className="text-sm text-text-secondary">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-accent-primary hover:text-accent-hover transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default Signup;