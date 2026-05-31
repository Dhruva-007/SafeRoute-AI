import React, { useState, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield, Lock, Eye, EyeOff, ArrowRight, Check, X, CheckCircle, AlertCircle,
} from 'lucide-react';
import { resetPasswordWithToken } from '../services/auth';

const getPasswordRules = (password) => [
  { label: 'At least 8 characters', met: password.length >= 8 },
  { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
  { label: 'One number', met: /\d/.test(password) },
];

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const passwordRules = useMemo(() => getPasswordRules(password), [password]);
  const allRulesMet = passwordRules.every((r) => r.met);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const passwordsMismatch = confirmPassword && password !== confirmPassword;

  const tokenMissing = !token;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!allRulesMet) {
      setError('Please meet all password requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await resetPasswordWithToken(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(err.message || 'Failed to reset password. Please try again.');
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
            {success ? 'Password Reset' : 'Set New Password'}
          </h1>
          <p className="text-text-secondary text-sm">
            {success
              ? 'Redirecting you to sign in...'
              : 'Choose a strong password for your account.'}
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8">
          {tokenMissing ? (
            // ── Missing token ───────────────────────────────────
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-danger-soft border border-danger/20">
                <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-danger">Invalid link</p>
                  <p className="text-xs text-text-secondary mt-1">
                    This page requires a valid reset token. Please request a new
                    password reset link.
                  </p>
                </div>
              </div>
              <Link to="/forgot-password" className="btn-primary w-full text-center py-3 block">
                Request Reset Link
              </Link>
            </div>
          ) : success ? (
            // ── Success ─────────────────────────────────────────
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-success-soft border border-success/20">
                <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-success">Password updated</p>
                  <p className="text-xs text-text-secondary mt-1">
                    Your password has been reset successfully. You can now sign in
                    with your new password.
                  </p>
                </div>
              </div>
              <Link to="/login" className="btn-primary w-full text-center py-3 block">
                Sign In Now
              </Link>
            </div>
          ) : (
            // ── Form ────────────────────────────────────────────
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-2xl bg-danger-soft border border-danger/20 text-danger text-sm font-medium"
                >
                  {error}
                </motion.div>
              )}

              {/* New password */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                    autoFocus
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

                {password && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 space-y-1"
                  >
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
                  </motion.div>
                )}
              </div>

              {/* Confirm password */}
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

              <button
                type="submit"
                disabled={loading || !allRulesMet || !passwordsMatch}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    Reset Password
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default ResetPassword;