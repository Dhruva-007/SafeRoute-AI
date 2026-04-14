import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Github, Twitter, Mail } from 'lucide-react';

function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-bg-primary/80">
      <div className="container-max px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-accent-primary" />
              </div>
              <span className="text-lg font-bold text-text-primary">
                Safe<span className="text-accent-primary">Route</span> AI
              </span>
            </Link>
            <p className="text-text-secondary text-sm leading-relaxed max-w-md">
              An Intelligent Travel Planning and Safety System. Making every journey safer, smarter, and more enjoyable with AI-powered insights.
            </p>
            <div className="flex items-center gap-3 mt-5">
              <a href="#" className="w-9 h-9 rounded-lg bg-white/5 border border-border-subtle flex items-center justify-center hover:bg-white/10 transition-colors">
                <Github className="w-4 h-4 text-text-secondary" />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-white/5 border border-border-subtle flex items-center justify-center hover:bg-white/10 transition-colors">
                <Twitter className="w-4 h-4 text-text-secondary" />
              </a>
              <a href="#" className="w-9 h-9 rounded-lg bg-white/5 border border-border-subtle flex items-center justify-center hover:bg-white/10 transition-colors">
                <Mail className="w-4 h-4 text-text-secondary" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-4">Product</h4>
            <ul className="space-y-2.5">
              {['Features', 'Safety Map', 'Translator', 'SOS System'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-text-secondary hover:text-accent-primary transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-4">Company</h4>
            <ul className="space-y-2.5">
              {['About', 'Privacy', 'Terms', 'Contact'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-text-secondary hover:text-accent-primary transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border-subtle mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-muted">
            © {new Date().getFullYear()} SafeRoute AI. All rights reserved.
          </p>
          <p className="text-xs text-text-muted">
            Built with safety in mind.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;