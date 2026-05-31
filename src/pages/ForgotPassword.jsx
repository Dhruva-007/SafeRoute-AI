import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Mail, ArrowRight, ArrowLeft, CheckCircle, Terminal } from 'lucide-react';
import { requestPasswordReset } from '../services/auth';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
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
            {submitted ? 'Check Your Console' : 'Reset Password'}
          </h1>
          <p className="text-text-secondary text-sm">
            {submitted
              ? "We've generated a reset link for your account."
              : "Enter your email and we'll generate a reset link."}
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8">
          {submitted ? (
            // ── Success state ───────────────────────────────────
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-success-soft border border-success/20">
                <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-success">
                    Request received
                  </p>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    If an account exists for <strong>{email}</strong>, a password
                    reset link has been generated.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-bg-elevated border border-[#DDD3C5]">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-4 h-4 text-accent-primary" />
                  <p className="text-sm font-semibold text-text-primary">
                    Development mode
                  </p>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Open your backend terminal — the reset link has been printed
                  there. Click the link or paste it in your browser to set a new
                  password.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setEmail('');
                  }}
                  className="btn-secondary w-full py-3"
                >
                  Send another link
                </button>
                <Link
                  to="/login"
                  className="w-full py-3 text-sm font-medium text-text-secondary hover:text-accent-primary transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            // ── Form state ──────────────────────────────────────
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
                    autoFocus
                    disabled={loading}
                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white/80 border border-[#DDD3C5] text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-4 focus:ring-accent-primary/10 transition-all disabled:opacity-60"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Reset Link
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="text-sm text-text-secondary hover:text-accent-primary transition-colors inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default ForgotPassword;