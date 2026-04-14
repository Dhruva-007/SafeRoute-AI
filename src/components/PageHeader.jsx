import React from 'react';
import { motion } from 'framer-motion';

function PageHeader({ icon: Icon, title, subtitle }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-8"
    >
      <div className="flex items-center gap-3 mb-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
            <Icon className="w-5 h-5 text-accent-primary" />
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">{title}</h1>
      </div>
      {subtitle && (
        <p className="text-text-secondary text-sm sm:text-base ml-0 sm:ml-[52px]">{subtitle}</p>
      )}
    </motion.div>
  );
}

export default PageHeader;