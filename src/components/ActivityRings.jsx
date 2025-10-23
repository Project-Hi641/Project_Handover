import React, { useState, useEffect } from 'react';

/**
 * ActivityRings Component
 * Displays Apple Watch-style activity rings for a single day
 * 
 * @param {Object} props
 * @param {number} props.standMinutes - Stand hours value (number of hourly intervals with standing)
 * @param {number} props.standGoal - Stand hours goal (default: 12)
 * @param {number} props.hrv - Heart rate variability value
 * @param {number} props.hrvPercent - HRV percentage (0-100, calculated based on age range)
 * @param {Array} props.hrvRange - HRV normal range [min, max]
 * @param {number} props.totalEnergy - Total daily energy expenditure (active + resting) in kJ
 * @param {number} props.totalEnergyGoal - Total energy goal (kJ)
 * @param {number} props.size - Size of the rings in pixels (default: 150)
 */
const ActivityRings = ({ 
  standMinutes = 0, 
  standGoal = 12, // Default goal: 12 stand hours
  hrv = 0, 
  hrvPercent = 0, // HRV percentage (calculated based on normal range)
  hrvRange = [40, 60], // Default HRV range for 65+ year older adult
  totalEnergy = 0, 
  totalEnergyGoal = 7500, // Default goal: 7500 kJ for sedentary older adult (equivalent to approx 1800 calories)
  size = 150 
}) => {
  // standMinutes actually represents stand hours (number of hourly intervals with standing)
  const standHours = standMinutes;
  
  // Calculate percentages (cap at 100%)
  const standPercent = Math.min((standHours / standGoal) * 100, 100);
  const totalEnergyPercent = Math.min((totalEnergy / totalEnergyGoal) * 100, 100);

  // State to trigger animations
  const [animate, setAnimate] = useState(false);

  // Trigger animation when component mounts or data changes
  useEffect(() => {
    // Reset animation
    setAnimate(false);
    const timer = setTimeout(() => {
      setAnimate(true);
    }, 200); // Increased delay for better visual effect

    return () => clearTimeout(timer);
  }, [standHours, hrvPercent, totalEnergy]); // Re-animate when any value changes

  // Ring configuration
  const strokeWidth = size * 0.08; // 8% of size
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  
  // Calculate stroke dash offset for each ring
  const getStrokeDashoffset = (percent) => {
    return circumference - (percent / 100) * circumference;
  };

  // Ring colors (Apple Watch style)
  const colors = {
    stand:  'var(--ring-stand, var(--bs-info))',
    hrv:    'var(--ring-hrv, var(--bs-danger))',
    restingEnergy: 'var(--ring-energy, var(--bs-success))'
  };

  // Ring radii (nested rings)
  const rings = [
    { 
      key: 'stand', 
      radius: radius * 0.95, 
      percent: standPercent, 
      color: colors.stand,
      label: 'Stand',
      value: standHours,
      unit: 'hr'
    },
    { 
      key: 'hrv', 
      radius: radius * 0.72, 
      percent: hrvPercent, 
      color: colors.hrv,
      label: 'HRV',
      value: Math.round(hrv),
      unit: 'ms'
    },
    { 
      key: 'totalEnergy', 
      radius: radius * 0.49, 
      percent: totalEnergyPercent, 
      color: colors.restingEnergy,
      label: 'Total Energy',
      value: Math.round(totalEnergy),
      unit: 'kJ'
    }
  ];

  const center = size / 2;

  return (
    <div 
      className="activity-rings" 
      style={{ 
        position: 'relative', 
        width: size, 
        height: size,
        animation: animate ? 'pulse 0.6s ease-in-out' : 'none'
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {rings.map((ring, index) => {
          const ringCircumference = 2 * Math.PI * ring.radius;
          const initialOffset = ringCircumference; // Start with empty ring
          const finalOffset = ringCircumference - (ring.percent / 100) * ringCircumference;
          const strokeDashoffset = animate ? finalOffset : initialOffset;
          
          return (
            <g key={ring.key}>
              {/* Background ring */}
              <circle
                cx={center}
                cy={center}
                r={ring.radius}
                fill="none"
                stroke="#2a2a2a"
                strokeWidth={strokeWidth}
                opacity={0.3}
              />
              {/* Progress ring with animation */}
              <circle
                cx={center}
                cy={center}
                r={ring.radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={strokeWidth}
                strokeDasharray={ringCircumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{
                  transition: `stroke-dashoffset ${2 + index * 0.3}s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${index * 0.2}s`,
                  filter: animate ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.4))' : 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.2))',
                  transform: animate ? 'scale(1.02)' : 'scale(1)',
                  transformOrigin: 'center'
                }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/**
 * ActivityRingsLegend Component
 * Displays a legend for the activity rings
 */
export const ActivityRingsLegend = ({ standMinutes, standGoal, hrv, hrvRange = [60, 90], totalEnergy, totalEnergyGoal }) => {
  // standMinutes actually represents stand hours (number of hourly intervals with standing)
  const standHours = standMinutes;
  const [hrvMin, hrvMax] = hrvRange;
  
  // Determine HRV status
  const hrvStatus = hrv < hrvMin ? 'Below' : hrv > hrvMax ? 'Above' : 'Normal';
  const hrvGoalDisplay = `${hrvMin}-${hrvMax}`;
  
  // theme-driven colors (falls back to Bootstrap tokens)
  const RING = {
    stand:  'var(--ring-stand, var(--bs-info))',
    hrv:    'var(--ring-hrv, var(--bs-danger))',
    energy: 'var(--ring-energy, var(--bs-success))',
  };
  
  const items = [
    {
      color: RING.stand,
      label: 'Stand Hours',
      value: standHours,
      goal: standGoal,
      unit: 'hr',
      showGoal: true,
    },
    {
      color: RING.hrv,
      label: 'Heart Rate Variability',
      value: Math.round(hrv),
      goal: hrvGoalDisplay,
      unit: 'ms',
      status: hrvStatus,
      showGoal: false,
    },
    {
      color: RING.energy,
      label: 'Total Energy Expenditure',
      value: Math.round(totalEnergy),
      goal: totalEnergyGoal,
      unit: 'kJ',
      showGoal: true,
    }
  ];

  return (
    <div className="activity-rings-legend">
      {items.map((item, idx) => {
        let percent;
        if (item.showGoal) {
          percent = Math.min((item.value / item.goal) * 100, 100);
        } else {
          // For HRV, calculate based on range
          const [min, max] = hrvRange;
          if (hrv < min) {
            percent = Math.max(0, (hrv / min) * 50);
          } else if (hrv <= max) {
            percent = 50 + ((hrv - min) / (max - min)) * 50;
          } else {
            percent = 100;
          }
        }
        
        return (
          <div key={idx} className="d-flex align-items-center mb-2">
            <div 
              style={{ 
                width: 12, 
                height: 12, 
                backgroundColor: item.color, 
                borderRadius: '50%',
                marginRight: 8
              }}
            />
            <div style={{ flex: 1 }}>
              <div className="d-flex justify-content-between align-items-center">
                <small className="text-muted">{item.label}</small>
                <small className="fw-bold">
                  {item.value} {item.unit}
                  {item.status && (
                    <span className={`ms-1 ${item.status === 'Normal' ? 'text-success' : 'text-warning'}`}>
                      ({item.status})
                    </span>
                  )}
                </small>
              </div>
              <div className="progress" style={{ height: 4, marginTop: 4 }}>
                <div 
                  className="progress-bar" 
                  role="progressbar" 
                  style={{ 
                    width: `${percent}%`, 
                    backgroundColor: item.color,
                    transition: 'width 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                    animation: 'progressFill 1.5s ease-out'
                  }}
                  aria-valuenow={percent} 
                  aria-valuemin="0" 
                  aria-valuemax="100"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ActivityRings;
