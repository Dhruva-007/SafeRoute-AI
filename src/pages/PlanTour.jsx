import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../components/PageHeader';
import { 
  Compass, MapPin, Calendar, Users, DollarSign, 
  Sparkles, Clock, Shield, ChevronRight, X,
  Sun, Cloud, Umbrella
} from 'lucide-react';

function PlanTour() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    destination: '',
    startDate: '',
    endDate: '',
    travelers: '1',
    budget: 'moderate',
    interests: [],
  });
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  const interests = [
    'Culture', 'Food', 'Nature', 'Adventure', 'History', 
    'Shopping', 'Nightlife', 'Relaxation'
  ];

  const toggleInterest = (interest) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const handleGenerate = async () => {
    setGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    setGenerated(true);
    setGenerating(false);
  };

  const generatedPlan = [
    { day: 1, title: 'Arrival & Exploration', items: [
      { time: '10:00', activity: 'Airport Arrival & Hotel Check-in', safety: 'high' },
      { time: '12:00', activity: 'Local Lunch at Recommended Spot', safety: 'high' },
      { time: '14:00', activity: 'Neighborhood Walking Tour', safety: 'high' },
      { time: '18:00', activity: 'Sunset Viewpoint Visit', safety: 'medium' },
    ]},
    { day: 2, title: 'Cultural Immersion', items: [
      { time: '09:00', activity: 'Historic Temple Complex', safety: 'high' },
      { time: '12:00', activity: 'Street Food Experience', safety: 'high' },
      { time: '14:00', activity: 'Local Art Gallery', safety: 'high' },
      { time: '16:00', activity: 'Rest Break (Fatigue Alert)', safety: 'rest' },
      { time: '19:00', activity: 'Traditional Dinner', safety: 'high' },
    ]},
    { day: 3, title: 'Adventure Day', items: [
      { time: '07:00', activity: 'Sunrise Hike', safety: 'medium' },
      { time: '11:00', activity: 'Nature Reserve Visit', safety: 'high' },
      { time: '13:00', activity: 'Picnic Lunch', safety: 'high' },
      { time: '16:00', activity: 'Local Market Shopping', safety: 'high' },
    ]},
  ];

  const safetyColors = {
    high: 'bg-green-500/20 text-green-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    rest: 'bg-blue-500/20 text-blue-400',
  };

  return (
    <div className="section-padding !pt-8">
      <div className="container-max">
        <PageHeader
          icon={Compass}
          title="Plan Your Tour"
          subtitle="Let AI create the perfect itinerary tailored to your preferences and safety needs."
        />

        {!generated ? (
          <div className="max-w-2xl mx-auto">
            <div className="glass-card p-6 sm:p-8">
              {/* Progress */}
              <div className="flex items-center gap-2 mb-8">
                {[1, 2, 3].map((s) => (
                  <React.Fragment key={s}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      step >= s ? 'bg-accent-primary text-bg-primary' : 'bg-white/5 text-text-muted'
                    }`}>
                      {s}
                    </div>
                    {s < 3 && (
                      <div className={`flex-1 h-0.5 rounded ${step > s ? 'bg-accent-primary' : 'bg-white/10'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-5"
                  >
                    <h3 className="text-lg font-semibold text-text-primary">Where to?</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Destination</label>
                      <div className="relative">
                        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          type="text"
                          value={formData.destination}
                          onChange={(e) => setFormData(p => ({ ...p, destination: e.target.value }))}
                          placeholder="e.g., Kyoto, Japan"
                          className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-primary/40 transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Start Date</label>
                        <div className="relative">
                          <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                          <input
                            type="date"
                            value={formData.startDate}
                            onChange={(e) => setFormData(p => ({ ...p, startDate: e.target.value }))}
                            className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/40 transition-all"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">End Date</label>
                        <div className="relative">
                          <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                          <input
                            type="date"
                            value={formData.endDate}
                            onChange={(e) => setFormData(p => ({ ...p, endDate: e.target.value }))}
                            className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/40 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <button onClick={() => setStep(2)} className="btn-primary w-full flex items-center justify-center gap-2 !py-3.5">
                      Continue <ChevronRight className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-5"
                  >
                    <h3 className="text-lg font-semibold text-text-primary">Travel Details</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Number of Travelers</label>
                      <div className="relative">
                        <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <select
                          value={formData.travelers}
                          onChange={(e) => setFormData(p => ({ ...p, travelers: e.target.value }))}
                          className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-border-subtle rounded-xl text-text-primary text-sm focus:outline-none focus:border-accent-primary/40 transition-all appearance-none"
                        >
                          {[1, 2, 3, 4, 5, '6+'].map(n => (
                            <option key={n} value={n} className="bg-bg-card">{n} {n === 1 ? 'traveler' : 'travelers'}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Budget</label>
                      <div className="grid grid-cols-3 gap-3">
                        {['budget', 'moderate', 'luxury'].map((b) => (
                          <button
                            key={b}
                            onClick={() => setFormData(p => ({ ...p, budget: b }))}
                            className={`p-3 rounded-xl text-sm font-medium capitalize transition-all ${
                              formData.budget === b
                                ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                                : 'bg-white/[0.04] text-text-secondary border border-border-subtle hover:bg-white/[0.06]'
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setStep(1)} className="btn-secondary flex-1 !py-3.5">Back</button>
                      <button onClick={() => setStep(3)} className="btn-primary flex-1 flex items-center justify-center gap-2 !py-3.5">
                        Continue <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-5"
                  >
                    <h3 className="text-lg font-semibold text-text-primary">Your Interests</h3>
                    
                    <div className="flex flex-wrap gap-2.5">
                      {interests.map((interest) => (
                        <button
                          key={interest}
                          onClick={() => toggleInterest(interest)}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            formData.interests.includes(interest)
                              ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                              : 'bg-white/[0.04] text-text-secondary border border-border-subtle hover:bg-white/[0.06]'
                          }`}
                        >
                          {interest}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-3">
                      <button onClick={() => setStep(2)} className="btn-secondary flex-1 !py-3.5">Back</button>
                      <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="btn-primary flex-1 flex items-center justify-center gap-2 !py-3.5 disabled:opacity-60"
                      >
                        {generating ? (
                          <>
                            <div className="w-5 h-5 border-2 border-bg-primary border-t-transparent rounded-full animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            Generate Plan
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Generated Header */}
            <div className="glass-card p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-text-primary mb-1">
                    {formData.destination || 'Kyoto, Japan'} — AI Generated Plan
                  </h2>
                  <p className="text-sm text-text-secondary">3-day itinerary • Safety-optimized • {formData.budget} budget</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10">
                    <Shield className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-green-400">95% Safe</span>
                  </div>
                  <button onClick={() => { setGenerated(false); setStep(1); }} className="btn-secondary !px-4 !py-2 text-sm">
                    New Plan
                  </button>
                </div>
              </div>
            </div>

            {/* Weather Bar */}
            <div className="glass-card p-4 mb-6 flex items-center gap-6 overflow-x-auto">
              {[
                { day: 'Day 1', icon: Sun, temp: '24°C', condition: 'Sunny' },
                { day: 'Day 2', icon: Cloud, temp: '21°C', condition: 'Cloudy' },
                { day: 'Day 3', icon: Umbrella, temp: '19°C', condition: 'Light Rain' },
              ].map((w) => (
                <div key={w.day} className="flex items-center gap-3 shrink-0">
                  <w.icon className="w-5 h-5 text-accent-primary" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{w.day}</p>
                    <p className="text-xs text-text-muted">{w.temp} • {w.condition}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="space-y-6">
              {generatedPlan.map((day) => (
                <div key={day.day} className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-text-primary mb-1">Day {day.day}</h3>
                  <p className="text-sm text-text-secondary mb-5">{day.title}</p>
                  <div className="space-y-3">
                    {day.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                        <span className="text-sm font-mono text-text-muted w-12 shrink-0">{item.time}</span>
                        <div className="w-2 h-2 rounded-full bg-accent-primary/60 shrink-0" />
                        <span className="text-sm text-text-primary flex-1">{item.activity}</span>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${safetyColors[item.safety]}`}>
                          {item.safety === 'rest' ? 'Rest' : item.safety}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default PlanTour;