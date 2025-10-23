import React, { useMemo } from 'react';
import { Card } from 'react-bootstrap';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';

// Sleep stage colors matching Apple Watch style
const SLEEP_STAGE_COLORS = {
  'Awake': '#ff8c00',     // Orange
  'REM': '#1e90ff',       // Dodger Blue
  'Core': '#0000ff',      // Blue
  'Deep': '#8a2be2',      // Violet
  'In bed': '#e5e7eb'     // Light gray
};

const SLEEP_STAGE_ORDER = ['Awake', 'REM', 'Core', 'Deep'];

// Sleep stage values for step line chart (Y-axis positioning)
const SLEEP_STAGE_VALUES = {
  'Awake': 4,
  'REM': 3,
  'Core': 2,
  'Deep': 1
};

// Sleep stage labels for display
const SLEEP_STAGE_LABELS = {
  'Awake': 'Awake',
  'REM': 'REM',
  'Core': 'Core',
  'Deep': 'Deep'
};

/**
 * HypnogramChart - Displays sleep stages over time in a timeline format
 * Similar to Apple Watch sleep tracking visualization
 */
export default function HypnogramChart({ 
  sleepData = [], 
  date, 
  title = "Sleep Hypnogram",
  height = 200 
}) {
  // Process sleep data into 1-minute intervals for stair-step chart
  const timelineData = useMemo(() => {
    if (!sleepData.length) return [];

    // Sort sleep data by timestamp
    const sortedData = [...sleepData].sort((a, b) => new Date(a.ts) - new Date(b.ts));
    
    // Find the sleep period start and end times
    let sleepStart = null;
    let sleepEnd = null;
    const validSleepData = [];
    
    sortedData.forEach(item => {
      const stage = canonicalStage(item?.payload?.stage);
      const timestamp = new Date(item.ts);
      const minutes = typeof item.value === "number" ? item.value : Number(item.value) || 0;
      
      // Only process actual sleep stages: Core + REM + Awake + Deep
      if (!Number.isFinite(minutes) || minutes <= 0) return;
      if (stage === "Core" || stage === "REM" || stage === "Awake" || stage === "Deep") {
        if (!sleepStart) sleepStart = timestamp;
        sleepEnd = timestamp;
        validSleepData.push({ stage, timestamp, minutes });
      }
    });
    
    if (!sleepStart || !sleepEnd) return [];
    
    // Create 1-minute intervals for stair-step visualization
    const intervals = [];
    const intervalMinutes = 1;
    const totalMinutes = Math.ceil((sleepEnd - sleepStart) / (1000 * 60));
    const numIntervals = Math.ceil(totalMinutes / intervalMinutes);
    
    let lastKnownStage = 'Awake'; // Default fallback for missing data
    
    for (let i = 0; i < numIntervals; i++) {
      const intervalStart = new Date(sleepStart.getTime() + (i * intervalMinutes * 60 * 1000));
      const intervalEnd = new Date(intervalStart.getTime() + (intervalMinutes * 60 * 1000));
      
      // Find all sleep stage data in this specific minute, sorted by timestamp
      const stagesInInterval = [];
      
      validSleepData.forEach(item => {
        const itemTime = new Date(item.timestamp);
        if (itemTime >= intervalStart && itemTime < intervalEnd) {
          stagesInInterval.push({
            stage: item.stage,
            minutes: item.minutes,
            timestamp: itemTime
          });
        }
      });
      
      // Sort by timestamp to get chronological order
      stagesInInterval.sort((a, b) => a.timestamp - b.timestamp);
      
      let currentStage = lastKnownStage; // Default fallback
      let hasData = false;
      
      if (stagesInInterval.length > 0) {
        // Use the first stage that appeared in this minute
        currentStage = stagesInInterval[0].stage;
        hasData = true;
        lastKnownStage = currentStage;
      }
      
      // Create base interval data point
      intervals.push({
        time: intervalStart,
        timeLabel: formatTime(intervalStart),
        minutes: i * intervalMinutes,
        stage: currentStage,
        stageValue: SLEEP_STAGE_VALUES[currentStage],
        stageLabel: SLEEP_STAGE_LABELS[currentStage],
        color: SLEEP_STAGE_COLORS[currentStage],
        hasData: hasData,
        confidence: hasData ? 1 : 0.5, // Lower confidence for inferred stages
        stagesInInterval: stagesInInterval // Store all stages for this interval
      });
      
      // If multiple stages in same minute, create additional data points for each stage
      if (stagesInInterval.length > 1) {
        stagesInInterval.slice(1).forEach((stageData, stageIndex) => {
          intervals.push({
            time: new Date(intervalStart.getTime() + ((stageIndex + 1) * 0.1 * 60 * 1000)),
            timeLabel: formatTime(new Date(intervalStart.getTime() + ((stageIndex + 1) * 0.1 * 60 * 1000))),
            minutes: i * intervalMinutes + ((stageIndex + 1) * 0.1),
            stage: stageData.stage,
            stageValue: SLEEP_STAGE_VALUES[stageData.stage],
            stageLabel: SLEEP_STAGE_LABELS[stageData.stage],
            color: SLEEP_STAGE_COLORS[stageData.stage],
            hasData: true,
            confidence: 1,
            isAdditionalStage: true
          });
        });
      }
    }
    
    // Sort intervals by minutes to ensure proper chronological order
    intervals.sort((a, b) => a.minutes - b.minutes);
    
    return intervals;
  }, [sleepData]);

  // Calculate total sleep time (Core + REM + Awake + Deep)
  const totalSleepTime = useMemo(() => {
    if (!timelineData.length) return 0;
    return timelineData.length; // 1 minute per interval
  }, [timelineData]);

  // Calculate sleep stage percentages
  const stageStats = useMemo(() => {
    const stats = {};
    timelineData.forEach(interval => {
      if (!stats[interval.stage]) {
        stats[interval.stage] = { duration: 0, percentage: 0 };
      }
      stats[interval.stage].duration += 1; // 1 minute per interval
    });
    
    Object.keys(stats).forEach(stage => {
      stats[stage].percentage = totalSleepTime > 0 
        ? Math.round((stats[stage].duration / totalSleepTime) * 100) 
        : 0;
    });
    
    return stats;
  }, [timelineData, totalSleepTime]);

  if (!timelineData.length) {
    return (
      <Card className="shadow-sm">
        <Card.Header>
          <h6 className="mb-0">{title}</h6>
          <small className="text-muted">{date}</small>
        </Card.Header>
        <Card.Body className="text-center py-4">
          <p className="text-muted">No sleep data available for this date</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <h6 className="mb-0">{title}</h6>
            <small className="text-muted">{date} • 1-minute intervals • Core + REM + Awake + Deep</small>
          </div>
          <div className="text-end">
            <div className="fw-bold">{formatDuration(totalSleepTime)}</div>
            <small className="text-muted">Total Sleep</small>
          </div>
        </div>
      </Card.Header>
      <Card.Body>
         {/* Hypnogram Chart - 1-Minute Intervals Stair-Step */}
         <div style={{ width: "100%", height: height }}>
           <ResponsiveContainer>
             <LineChart 
               data={timelineData} 
               margin={{ top: 20, right: 20, left: 60, bottom: 20 }}
             >
               <CartesianGrid strokeDasharray="2 2" stroke="#e9ecef" />
               <XAxis 
                 dataKey="minutes"
                 type="number"
                 domain={[0, totalSleepTime]}
                 tickFormatter={(value) => formatDuration(value)}
                 tick={{ fontSize: 11, fill: '#6c757d' }}
                 axisLine={{ stroke: '#dee2e6' }}
                 tickLine={{ stroke: '#dee2e6' }}
               />
               <YAxis 
                 dataKey="stageValue"
                 type="number"
                 domain={[0.5, 4.5]}
                 tick={{ fontSize: 12, fill: '#495057' }}
                 tickFormatter={(value) => {
                   const stage = Object.keys(SLEEP_STAGE_VALUES).find(key => SLEEP_STAGE_VALUES[key] === value);
                   return stage || '';
                 }}
                 axisLine={false}
                 tickLine={false}
               />
               <Tooltip 
                 formatter={(value, name, props) => [
                   props.payload.stageLabel,
                   `Time: ${props.payload.timeLabel}`
                 ]}
                 labelFormatter={(label) => `Minutes: ${label}`}
                 contentStyle={{
                   backgroundColor: '#ffffff',
                   border: '1px solid #dee2e6',
                   borderRadius: '8px',
                   boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                 }}
               />
               {/* Render stair-step line with custom dot colors */}
               <Line 
                 type="stepAfter"
                 dataKey="stageValue"
                 stroke="#8884d8"
                 strokeWidth={3}
                 dot={(props) => {
                   const { cx, cy, payload } = props;
                   return (
                     <circle
                       cx={cx}
                       cy={cy}
                       r={4}
                       fill={payload.color}
                       stroke={payload.color}
                       strokeWidth={2}
                     />
                   );
                 }}
                 activeDot={{ r: 6, fill: '#007AFF' }}
                 connectNulls={false}
               />
             </LineChart>
           </ResponsiveContainer>
         </div>

        {/* Sleep Stage Legend and Stats */}
        <div className="mt-3">
          <div className="row g-2">
            {SLEEP_STAGE_ORDER.map(stage => {
              const stats = stageStats[stage];
              if (!stats || stats.duration === 0) return null;
              
              return (
                <div key={stage} className="col-6 col-md-3">
                  <div className="d-flex align-items-center">
                    <div 
                      className="me-2" 
                      style={{ 
                        width: 12, 
                        height: 12, 
                        backgroundColor: SLEEP_STAGE_COLORS[stage],
                        borderRadius: '2px'
                      }}
                    />
                    <div className="flex-grow-1">
                      <div className="small fw-bold">{stage}</div>
                      <div className="small text-muted">
                        {formatDuration(stats.duration)} ({stats.percentage}%)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}

// Helper functions
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

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
}

function formatDuration(minutes) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}
