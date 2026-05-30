// src/services/planner.js

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const planTrip = async (formData) => {
  const payload = {
    destination: formData.destination.trim(),
    start_date: formData.startDate,
    end_date: formData.endDate,
    number_of_travelers: parseInt(formData.travelers, 10),
    budget: mapBudget(formData.budget),
    interests: formData.interests.map(i => i.toLowerCase()),
  };

  try {
    const response = await fetch(`${API_BASE_URL}/plan-trip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      
      // Handle specific status codes
      if (response.status === 422) {
        throw new Error(errorData.detail?.message || 'Invalid request parameters.');
      } else if (response.status === 429) {
        throw new Error('AI service is temporarily busy. Please wait a moment and try again.');
      } else if (response.status === 504) {
        throw new Error('Request timed out. The AI model took too long. Please try again.');
      } else {
        throw new Error(errorData.detail?.message || 'Failed to generate itinerary.');
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Plan Trip Error:', error);
    throw error;
  }
};

/**
 * Maps frontend budget labels to backend expectations.
 */
function mapBudget(budgetLabel) {
  switch (budgetLabel) {
    case 'budget': return 'budget';
    case 'moderate': return 'mid-range'; // Legacy mapping if needed
    case 'mid-range': return 'mid-range';
    case 'luxury': return 'premium';     // Legacy mapping
    case 'premium': return 'premium';
    default: return 'mid-range';
  }
}

/**
 * Validates basic form data before sending.
 */
export const validateFormData = (data) => {
  const errors = [];
  
  if (!data.destination.trim()) {
    errors.push('Please enter a destination.');
  }
  
  if (!data.startDate || !data.endDate) {
    errors.push('Please select start and end dates.');
  } else if (new Date(data.startDate) > new Date(data.endDate)) {
    errors.push('End date cannot be before start date.');
  }
  
  const travelerCount = parseInt(data.travelers, 10);
  if (isNaN(travelerCount) || travelerCount < 1 || travelerCount > 50) {
    errors.push('Number of travelers must be between 1 and 50.');
  }
  
  if (data.interests.length === 0) {
    errors.push('Please select at least one interest.');
  }

  return errors;
};