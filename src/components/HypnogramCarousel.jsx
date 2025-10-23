import React, { useMemo, useState } from 'react';
import { Carousel, Button, Row, Col, Alert, Spinner } from 'react-bootstrap';
import HypnogramChart from './HypnogramChart';

/**
 * HypnogramCarousel - Displays daily hypnogram charts in a carousel format
 * Shows sleep stage timelines for each day with navigation
 */
export default function HypnogramCarousel({ 
  sleepData = [], 
  dateRange = 7, // Number of days to show
  onClose,
  isPopup = false
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Process sleep data into daily groups
  const dailyHypnograms = useMemo(() => {
    if (!sleepData.length) return [];

    // Group sleep data by date
    const dailyData = {};
    sleepData.forEach(item => {
      const date = new Date(item.ts).toISOString().slice(0, 10);
      if (!dailyData[date]) {
        dailyData[date] = [];
      }
      dailyData[date].push(item);
    });

    // Convert to array and sort by date (most recent first)
    return Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        data,
        displayDate: new Date(date).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }),
        shortDate: new Date(date).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, dateRange); // Limit to specified number of days
  }, [sleepData, dateRange]);

  // Calculate total sleep time for each day (Core + REM + Awake + Deep)
  const dailyStats = useMemo(() => {
    return dailyHypnograms.map(day => {
      const totalSleepMinutes = day.data.reduce((sum, item) => {
        const stage = canonicalStage(item?.payload?.stage);
        const minutes = typeof item.value === "number" ? item.value : Number(item.value) || 0;
        
        // Only count actual sleep stages: Core + REM + Awake + Deep
        if (!Number.isFinite(minutes) || minutes <= 0) return sum;
        if (stage === "Core" || stage === "REM" || stage === "Awake" || stage === "Deep") {
          return sum + minutes;
        }
        
        return sum;
      }, 0);
      
      return {
        ...day,
        totalSleepTime: totalSleepMinutes,
        sleepStages: calculateSleepStages(day.data, totalSleepMinutes)
      };
    });
  }, [dailyHypnograms]);

  if (!dailyHypnograms.length) {
    return (
      <div className="mt-4">
        <Alert variant="info">
          <Alert.Heading>No Sleep Data Available</Alert.Heading>
          <p>No sleep data found for the selected date range. Please ensure your health data integration is set up correctly.</p>
          {onClose && (
            <Button variant="outline-primary" onClick={onClose}>
              Close
            </Button>
          )}
        </Alert>
      </div>
    );
  }

  return (
    <div className={isPopup ? "hypnogram-popup-content" : "mt-4"}>
      {!isPopup && (
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 className="mb-1">Daily Sleep Hypnograms</h5>
            <p className="text-muted mb-0">
              Detailed sleep stage breakdown for the last {dailyHypnograms.length} days • 1-minute intervals • Core + REM + Awake + Deep
            </p>
          </div>
          {onClose && (
            <Button variant="outline-secondary" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      )}

      <Carousel 
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        indicators={true}
        controls={true}
        interval={null}
        pause="hover"
        className="hypnogram-carousel"
      >
        {dailyStats.map((day, index) => (
          <Carousel.Item key={day.date}>
            <Row className="g-3">
              <Col lg={8}>
                <HypnogramChart
                  sleepData={day.data}
                  date={day.displayDate}
                  title={`Sleep Timeline - ${day.shortDate}`}
                  height={300}
                />
              </Col>
              <Col lg={4}>
                <div className="d-flex flex-column gap-3">
                  {/* Daily Sleep Summary */}
                  <div className="card shadow-sm">
                    <div className="card-body">
                      <h6 className="card-title">Sleep Summary</h6>
                      <div className="mb-2">
                        <div className="fw-bold text-primary">
                          {formatDuration(day.totalSleepTime)}
                        </div>
                        <small className="text-muted">Total Sleep Time</small>
                      </div>
                      <div className="small">
                        <div className="d-flex justify-content-between mb-1">
                          <span>Sleep Quality:</span>
                          <span style={{ color: getSleepQualityRating(day.sleepStages).color }}>
                            {getSleepQualityRating(day.sleepStages).rating}
                          </span>
                        </div>
                        <div className="small text-muted mb-2">
                          {getSleepQualityRating(day.sleepStages).description}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sleep Stage Breakdown */}
                  <div className="card shadow-sm">
                    <div className="card-body">
                      <h6 className="card-title">Stage Breakdown</h6>
                      {Object.entries(day.sleepStages).map(([stage, stats]) => (
                        <div key={stage} className="d-flex justify-content-between align-items-center mb-2">
                          <div className="d-flex align-items-center">
                            <div 
                              className="me-2" 
                              style={{ 
                                width: 10, 
                                height: 10, 
                                backgroundColor: getStageColor(stage),
                                borderRadius: '2px'
                              }}
                            />
                            <span className="small">{stage}</span>
                          </div>
                          <div className="text-end">
                            <div className="small fw-bold">{formatDuration(stats.duration)}</div>
                            <div className="small text-muted">{stats.percentage}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sleep Insights */}
                  <div className="card shadow-sm">
                    <div className="card-body">
                      <h6 className="card-title">Insights</h6>
                      <div className="small">
                        {generateSleepInsights(day.sleepStages, day.totalSleepTime).map((insight, idx) => (
                          <div key={idx} className="mb-1">
                            <span className="text-muted">•</span> {insight}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          </Carousel.Item>
        ))}
      </Carousel>

      {/* Carousel Navigation Info */}
      <div className="text-center mt-3">
        <small className="text-muted">
          Showing {activeIndex + 1} of {dailyStats.length} days • 
          Use arrows or swipe to navigate
        </small>
      </div>
    </div>
  );
}

// Helper functions
function calculateSleepStages(sleepData, totalMinutes) {
  const stages = {};
  
  sleepData.forEach(item => {
    const stage = canonicalStage(item?.payload?.stage);
    const minutes = typeof item.value === "number" ? item.value : Number(item.value) || 0;
    
    // Process all sleep stages including "In bed"
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    if (stage === "Core" || stage === "REM" || stage === "Awake" || stage === "Deep" || stage === "In bed") {
      if (!stages[stage]) {
        stages[stage] = { duration: 0, percentage: 0 };
      }
      stages[stage].duration += minutes;
    }
  });
  
  // Calculate percentages based on total sleep time (Core + REM + Awake + Deep)
  const sleepStagesTotal = (stages.Core?.duration || 0) + (stages.REM?.duration || 0) + (stages.Awake?.duration || 0) + (stages.Deep?.duration || 0);
  
  Object.keys(stages).forEach(stage => {
    if (stage === "In bed") {
      // In bed percentage is calculated against total in bed time
      stages[stage].percentage = stages[stage].duration > 0 ? 100 : 0;
    } else {
      // Sleep stages percentage is calculated against total sleep time
      stages[stage].percentage = sleepStagesTotal > 0 
        ? Math.round((stages[stage].duration / sleepStagesTotal) * 100) 
        : 0;
    }
  });
  
  return stages;
}

function canonicalStage(s) {
  if (!s) return "";
  const t = String(s).trim();
  const lc = t.toLowerCase();
  if (lc === "in bed" || lc === "inbed" || lc === "in-bed") return "In bed";
  if (lc === "light") return "Core";
  if (lc === "core") return "Core";
  if (lc === "deep") return "Deep";
  if (lc === "rem") return "REM";
  if (lc === "awake") return "Awake";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function getStageColor(stage) {
  const colors = {
    'Awake': '#ffa94d',
    'REM': '#60a5fa',
    'Core': '#2563eb',
    'Deep': '#a78bfa',
    'In bed': '#e5e7eb'
  };
  return colors[stage] || '#999999';
}

function formatDuration(minutes) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function getSleepQuality(stages) {
  const deepPercent = stages.Deep?.percentage || 0;
  const remPercent = stages.REM?.percentage || 0;
  const corePercent = stages.Core?.percentage || 0;
  const awakePercent = stages.Awake?.percentage || 0;
  
  // Optimal criteria for sleep stages
  const optimalDeep = deepPercent >= 20;      // 20% or more deep sleep
  const optimalRem = remPercent >= 20;        // 20% or more REM sleep
  const optimalCore = corePercent >= 40;      // 40% or more core sleep
  const optimalAwake = awakePercent <= 5;     // 5% or less awake time
  
  // Determine sleep quality rating based on optimal criteria
  if (optimalDeep && optimalRem && optimalCore && optimalAwake) {
    return "Excellent";
  } else if (optimalDeep && optimalRem) {
    return "Good";
  } else if (optimalDeep || optimalRem) {
    return "Fair";
  } else {
    return "Poor";
  }
}

function getSleepQualityClass(stages) {
  const quality = getSleepQuality(stages);
  const classes = {
    "Excellent": "text-success",
    "Good": "text-primary", 
    "Fair": "text-warning",
    "Poor": "text-danger"
  };
  return classes[quality] || "text-muted";
}

function getSleepQualityRating(stages) {
  const deepPercent = stages.Deep?.percentage || 0;
  const remPercent = stages.REM?.percentage || 0;
  const corePercent = stages.Core?.percentage || 0;
  const awakePercent = stages.Awake?.percentage || 0;
  
  // Optimal criteria for sleep stages
  const optimalDeep = deepPercent >= 20;      // 20% or more deep sleep
  const optimalRem = remPercent >= 20;        // 20% or more REM sleep
  const optimalCore = corePercent >= 40;      // 40% or more core sleep
  const optimalAwake = awakePercent <= 5;     // 5% or less awake time
  
  // Determine sleep quality rating based on optimal criteria
  if (optimalDeep && optimalRem && optimalCore && optimalAwake) {
    return { rating: 'Excellent', color: '#28a745', description: 'All optimal criteria met' };
  } else if (optimalDeep && optimalRem) {
    return { rating: 'Good', color: '#17a2b8', description: 'Deep and REM sleep meet optimal criteria' };
  } else if (optimalDeep || optimalRem) {
    return { rating: 'Fair', color: '#ffc107', description: optimalDeep ? 'Deep sleep meets optimal criteria' : 'REM sleep meets optimal criteria' };
  } else {
    return { rating: 'Poor', color: '#dc3545', description: 'Deep and REM sleep do not meet optimal criteria' };
  }
}

function calculateSleepEfficiencyRating(stages) {
  const deepPercent = stages.Deep?.percentage || 0;
  const remPercent = stages.REM?.percentage || 0;
  const corePercent = stages.Core?.percentage || 0;
  const awakePercent = stages.Awake?.percentage || 0;
  
  // Optimal criteria for sleep stages
  const optimalDeep = deepPercent >= 20;      // 20% or more deep sleep
  const optimalRem = remPercent >= 20;        // 20% or more REM sleep
  const optimalCore = corePercent >= 40;      // 40% or more core sleep
  const optimalAwake = awakePercent <= 5;     // 5% or less awake time
  
  // Determine efficiency rating based on optimal criteria
  if (optimalDeep && optimalRem && optimalCore && optimalAwake) {
    return { rating: 'Excellent', color: '#28a745', description: 'All optimal criteria met' };
  } else if (optimalDeep && optimalRem) {
    return { rating: 'Good', color: '#17a2b8', description: 'Deep and REM sleep meet optimal criteria' };
  } else if (optimalDeep || optimalRem) {
    return { rating: 'Fair', color: '#ffc107', description: optimalDeep ? 'Deep sleep meets optimal criteria' : 'REM sleep meets optimal criteria' };
  } else {
    return { rating: 'Poor', color: '#dc3545', description: 'Deep and REM sleep do not meet optimal criteria' };
  }
}

function generateSleepInsights(stages, totalMinutes) {
  const insights = [];
  const deepPercent = stages.Deep?.percentage || 0;
  const remPercent = stages.REM?.percentage || 0;
  const awakePercent = stages.Awake?.percentage || 0;
  
  if (deepPercent >= 20) {
    insights.push("Great deep sleep duration");
  } else if (deepPercent < 10) {
    insights.push("Consider improving deep sleep");
  }
  
  if (remPercent >= 20) {
    insights.push("Good REM sleep achieved");
  } else if (remPercent < 15) {
    insights.push("REM sleep could be improved");
  }
  
  if (awakePercent <= 5) {
    insights.push("Minimal wake time during sleep");
  } else if (awakePercent > 15) {
    insights.push("High wake time - consider sleep hygiene");
  }
  
  if (totalMinutes >= 420) { // 7 hours
    insights.push("Adequate sleep duration");
  } else if (totalMinutes < 360) { // 6 hours
    insights.push("Consider getting more sleep");
  }
  
  return insights.length > 0 ? insights : ["No specific insights available"];
}
