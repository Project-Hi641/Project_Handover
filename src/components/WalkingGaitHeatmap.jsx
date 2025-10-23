import React, { useMemo } from 'react';
import { Card, Row, Col, Alert } from 'react-bootstrap';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend } from 'recharts';

/**
 * WalkingGaitHeatmap - Displays hourly walking gait metrics for a specified number of days
 * Shows walking asymmetry, walking speed, double support time, and walking step length
 */
export default function WalkingGaitHeatmap({ 
  walkingAsymmetryData = [],
  walkingSpeedData = [],
  doubleSupportTimeData = [],
  walkingStepLengthData = [],
  stepsData = [],
  dateRange = 7
}) {
  
  // Process walking gait data into hourly buckets for the specified date range
  const gaitHeatmapData = useMemo(() => {
    // Get the most recent N days based on dateRange prop
    const lastNDays = [];
    for (let i = dateRange - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      lastNDays.push(date.toISOString().slice(0, 10));
    }

    // Helper to group data by date and hour
    const groupByDateHour = (data) => {
      const grouped = {};
      data.forEach(item => {
        const timestamp = new Date(item.ts);
        const date = timestamp.toISOString().slice(0, 10);
        const hour = timestamp.getHours();
        const key = `${date}-${hour}`;
        
        const value = typeof item.value === "number" ? item.value : Number(item.value);
        if (!Number.isNaN(value)) {
          if (!grouped[key]) {
            grouped[key] = { sum: 0, count: 0, values: [] };
          }
          grouped[key].sum += value;
          grouped[key].count += 1;
          grouped[key].values.push(value);
        }
      });
      
      // Calculate averages
      const result = {};
      Object.entries(grouped).forEach(([key, { sum, count }]) => {
        result[key] = sum / count;
      });
      return result;
    };

    // Group all metrics by date-hour
    const asymmetryByHour = groupByDateHour(walkingAsymmetryData);
    const speedByHour = groupByDateHour(walkingSpeedData);
    const doubleSupportByHour = groupByDateHour(doubleSupportTimeData);
    const stepLengthByHour = groupByDateHour(walkingStepLengthData);
    
    // Calculate steps per hour (only count hours with steps)
    const stepsPerHour = {};
    stepsData.forEach(item => {
      const timestamp = new Date(item.ts);
      const date = timestamp.toISOString().slice(0, 10);
      const hour = timestamp.getHours();
      const key = `${date}-${hour}`;
      
      const value = typeof item.value === "number" ? item.value : Number(item.value);
      if (!Number.isNaN(value)) {
        stepsPerHour[key] = (stepsPerHour[key] || 0) + value;
      }
    });

    // Calculate daily aggregate steps and hours with steps for each day
    const dailyStepsAggregates = {};
    lastNDays.forEach(date => {
      let totalSteps = 0;
      let hoursWithSteps = 0;
      
      for (let hour = 0; hour < 24; hour++) {
        const key = `${date}-${hour}`;
        if (stepsPerHour[key] && stepsPerHour[key] > 0) {
          totalSteps += stepsPerHour[key];
          hoursWithSteps += 1;
        }
      }
      
      // Calculate steps per second for this day: total daily steps / (hours with steps × 3600 seconds per hour)
      const totalSecondsWithSteps = hoursWithSteps * 3600;
      dailyStepsAggregates[date] = {
        totalSteps,
        hoursWithSteps,
        stepsPerSecond: totalSecondsWithSteps > 0 ? totalSteps / totalSecondsWithSteps : 0
      };
    });

    // Build heatmap data
    const heatmapData = [];
    lastNDays.forEach((date, dayIndex) => {
      const dailyAggregate = dailyStepsAggregates[date];
      
      for (let hour = 0; hour < 24; hour++) {
        const key = `${date}-${hour}`;
        const hasSteps = stepsPerHour[key] && stepsPerHour[key] > 0;
        
        // Only include hours where steps were taken AND gait metrics are available (non-zero)
        if (hasSteps) {
          const asymmetry = asymmetryByHour[key] || 0;
          const speed = speedByHour[key] || 0;
          const doubleSupport = doubleSupportByHour[key] || 0;
          const stepLength = stepLengthByHour[key] || 0;
          const steps = stepsPerHour[key] || 0;
          
          // Only include data points where at least one gait metric has a meaningful value (> 0)
          const hasGaitData = asymmetry > 0 || speed > 0 || doubleSupport > 0 || stepLength > 0;
          
          if (hasGaitData) {
            heatmapData.push({
              date,
              dateLabel: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }),
              hour,
              hourLabel: `${hour.toString().padStart(2, '0')}:00`,
              dayIndex,
              asymmetry: Math.round(asymmetry * 100) / 100, // Round to 2 decimal places
              speed: Math.round(speed * 100) / 100,
              doubleSupport: Math.round(doubleSupport * 100) / 100,
              stepLength: Math.round(stepLength * 100) / 100,
              steps,
              key
            });
          }
        }
      }
    });

    return heatmapData;
  }, [walkingAsymmetryData, walkingSpeedData, doubleSupportTimeData, walkingStepLengthData, stepsData, dateRange]);

  // Calculate daily averages for summary stats
  const dailyAverages = useMemo(() => {
    if (!gaitHeatmapData.length) return [];

    const dailyData = {};
    
    gaitHeatmapData.forEach(item => {
      if (!dailyData[item.date]) {
        dailyData[item.date] = {
          date: item.date,
          dateLabel: item.dateLabel,
          asymmetry: { sum: 0, count: 0 },
          speed: { sum: 0, count: 0 },
          doubleSupport: { sum: 0, count: 0 },
          stepLength: { sum: 0, count: 0 },
          steps: { sum: 0, count: 0 }
        };
      }
      
      if (item.asymmetry > 0) {
        dailyData[item.date].asymmetry.sum += item.asymmetry;
        dailyData[item.date].asymmetry.count += 1;
      }
      if (item.speed > 0) {
        dailyData[item.date].speed.sum += item.speed;
        dailyData[item.date].speed.count += 1;
      }
      if (item.doubleSupport > 0) {
        dailyData[item.date].doubleSupport.sum += item.doubleSupport;
        dailyData[item.date].doubleSupport.count += 1;
      }
      if (item.stepLength > 0) {
        dailyData[item.date].stepLength.sum += item.stepLength;
        dailyData[item.date].stepLength.count += 1;
      }
      dailyData[item.date].steps.sum += item.steps;
      dailyData[item.date].steps.count += 1;
    });

    return Object.values(dailyData).map(day => ({
      date: day.date,
      dateLabel: day.dateLabel,
      avgAsymmetry: day.asymmetry.count > 0 ? Math.round((day.asymmetry.sum / day.asymmetry.count) * 100) / 100 : 0,
      avgSpeed: day.speed.count > 0 ? Math.round((day.speed.sum / day.speed.count) * 100) / 100 : 0,
      avgDoubleSupport: day.doubleSupport.count > 0 ? Math.round((day.doubleSupport.sum / day.doubleSupport.count) * 100) / 100 : 0,
      avgStepLength: day.stepLength.count > 0 ? Math.round((day.stepLength.sum / day.stepLength.count) * 100) / 100 : 0,
      totalSteps: day.steps.sum
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [gaitHeatmapData]);

  // Calculate max day index for Y-axis configuration
  const maxDayIndex = Math.max(0, dateRange - 1);
  
  // Create day ticks showing every 3rd day
  const dayTicks = useMemo(() => {
    const ticks = [];
    const step = 3; // Show every 3rd day
    for (let i = 0; i < dateRange; i += step) {
      ticks.push(i);
    }
    // Always include the last day if it's not already included
    if (dateRange > 0 && !ticks.includes(dateRange - 1)) {
      ticks.push(dateRange - 1);
    }
    return ticks;
  }, [dateRange]);
  
  // Create day labels array that corresponds to dayIndex with even spacing and month information
  const dayLabels = useMemo(() => {
    // Create labels array for all possible day indices based on dateRange
    const labels = [];
    
    // Generate labels for all days in the date range, regardless of data availability
    for (let i = 0; i < dateRange; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (dateRange - 1 - i)); // Calculate the actual date for this dayIndex
      const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
      
      // Extract day name, number, and month from the dateLabel
      const parts = dateLabel.split(', ');
      if (parts.length >= 2) {
        const dayName = parts[0]; // e.g., "Mon"
        const dayAndMonth = parts[1]; // e.g., "Jan 15"
        const dayMonthParts = dayAndMonth.split(' ');
        if (dayMonthParts.length >= 2) {
          const month = dayMonthParts[0]; // e.g., "Jan"
          const dayNumber = dayMonthParts[1]; // e.g., "15"
          labels.push(`${dayName} ${dayNumber} ${month}`); // e.g., "Mon 15 Jan"
        } else {
          labels.push(`${dayName} ${dayAndMonth}`);
        }
      } else {
        labels.push(dateLabel);
      }
    }
    
    return labels;
  }, [dateRange]);

  // Calculate overall averages for the selected date range
  const weeklyAverages = useMemo(() => {
    if (!dailyAverages.length) return {
      asymmetry: 0,
      speed: 0,
      doubleSupport: 0,
      stepLength: 0,
      steps: 0
    };

    const validDays = dailyAverages.filter(d => 
      d.avgAsymmetry > 0 || d.avgSpeed > 0 || d.avgDoubleSupport > 0 || d.avgStepLength > 0
    );

    if (!validDays.length) return {
      asymmetry: 0,
      speed: 0,
      doubleSupport: 0,
      stepLength: 0,
      steps: 0
    };

    return {
      asymmetry: Math.round((validDays.reduce((sum, d) => sum + d.avgAsymmetry, 0) / validDays.length) * 100) / 100,
      speed: Math.round((validDays.reduce((sum, d) => sum + d.avgSpeed, 0) / validDays.length) * 100) / 100,
      doubleSupport: Math.round((validDays.reduce((sum, d) => sum + d.avgDoubleSupport, 0) / validDays.length) * 100) / 100,
      stepLength: Math.round((validDays.reduce((sum, d) => sum + d.avgStepLength, 0) / validDays.length) * 100) / 100,
      steps: Math.round(validDays.reduce((sum, d) => sum + d.totalSteps, 0) / validDays.length)
    };
  }, [dailyAverages]);

  // Gait insights logic
  const showFallRiskInsights = weeklyAverages.asymmetry >= 5 || 
                               weeklyAverages.speed <= 3.6 || 
                               weeklyAverages.stepLength <= 0.6 || 
                               weeklyAverages.doubleSupport >= 30;

  const gaitInsights = {
    showFallRiskInsights,
    asymmetry: weeklyAverages.asymmetry,
    speed: weeklyAverages.speed,
    stepLength: weeklyAverages.stepLength,
    doubleSupport: weeklyAverages.doubleSupport
  };

  // Get color based on metric value
  const getAsymmetryColor = (value) => {
    // Walking asymmetry: Lower is better (ideal < 2%)
    if (value < 2) return 'var(--bs-success)'; // Green - Excellent
    if (value < 5) return 'var(--bs-warning)'; // Yellow - Fair
    return 'var(--bs-danger)'; // Red - Needs attention
  };

  const getSpeedColor = (value) => {
    // Walking speed: Typical range 3.6-5.0 km/hr
    if (value >= 3.6 && value <= 5.0) return 'var(--bs-success)'; // Green - Normal
    if (value >= 2.9 && value < 3.6) return 'var(--bs-warning)'; // Yellow - Slow
    if (value > 5.0) return 'var(--bs-info)'; // Blue - Fast
    return 'var(--bs-danger)'; // Red - Very slow
  };

  const getDoubleSupportColor = (value) => {
    // Double support time: Typical range 20-30% (as percentage)
    if (value >= 20 && value <= 30) return 'var(--bs-success)'; // Green - Normal
    if (value >= 20 && value <= 30) return 'var(--bs-success)'; // Yellow - Low
    if (value > 30 && value <= 40) return 'var(--bs-warning)'; // Yellow - High
    return 'var(--bs-danger)'; // Red - Abnormal
  };

   const getStepLengthColor = (value) => {
     // Walking step length: Typical range 0.60-0.80 meters
     if (value >= 0.60 && value <= 0.80) return 'var(--bs-success)'; // Green - Normal
     if (value >= 0.50 && value < 0.60) return 'var(--bs-warning)'; // Yellow - Short
     if (value > 0.80 && value <= 0.90) return 'var(--bs-info)'; // Blue - Long
     if (value > 0.90) return 'var(--bs-info)'; // Blue - Very long
     return 'var(--bs-danger)'; // Red - Very short
   };


  if (!gaitHeatmapData.length) {
    return (
      <div className="text-center py-5">
        <Alert variant="info">
          <Alert.Heading>No Walking Gait Data Available</Alert.Heading>
          <p className="mb-0">
            No valid walking gait data found for the last {dateRange} days (excluding days with zero values). 
            Walking metrics include asymmetry, speed, and double support time.
          </p>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <Row className="g-3">
        {/* Walking Asymmetry Heatmap */}
        <Col lg={6}>
          <Card className="shadow-sm h-100">
            <Card.Header>
              <h6 className="mb-0">Walking Asymmetry (%)</h6>
              <small className="text-muted">Hourly average - Lower is better (&lt;2% ideal)</small>
            </Card.Header>
            <Card.Body>
              <div style={{ width: "100%", height: 250 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      type="number" 
                      dataKey="hour" 
                      domain={[0, 23]}
                      ticks={[0, 4, 8, 12, 16, 20, 23]}
                      tickFormatter={(hour) => `${hour}:00`}
                      label={{ value: 'Hour of Day', position: 'bottom', offset: 0 }}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="dayIndex" 
                      domain={[0, maxDayIndex]}
                      ticks={dayTicks}
                      tickFormatter={(idx) => dayLabels[idx] || ''}
                      label={{ value: 'Day', angle: -90, position: 'left' }}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 border rounded shadow-sm">
                              <div className="small">
                                <div className="fw-bold">{data.dateLabel}</div>
                                <div>{data.hourLabel}</div>
                                <div className="mt-1">
                                  <strong>Asymmetry:</strong> {data.asymmetry}%
                                </div>
                                <div className="text-muted">
                                  {data.asymmetry < 2 ? '✓ Excellent balance' : 
                                   data.asymmetry < 5 ? '~ Fair balance' : 
                                   '⚠ Needs attention'}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter data={gaitHeatmapData}>
                      {gaitHeatmapData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={getAsymmetryColor(entry.asymmetry)}
                          opacity={0.8}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Walking Speed Heatmap */}
        <Col lg={6}>
          <Card className="shadow-sm h-100">
            <Card.Header>
              <h6 className="mb-0">Walking Speed (km/hr)</h6>
              <small className="text-muted">Hourly average - Normal range: 3.6-5.0 km/hr</small>
            </Card.Header>
            <Card.Body>
              <div style={{ width: "100%", height: 250 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      type="number" 
                      dataKey="hour" 
                      domain={[0, 23]}
                      ticks={[0, 4, 8, 12, 16, 20, 23]}
                      tickFormatter={(hour) => `${hour}:00`}
                      label={{ value: 'Hour of Day', position: 'bottom', offset: 0 }}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="dayIndex" 
                      domain={[0, maxDayIndex]}
                      ticks={dayTicks}
                      tickFormatter={(idx) => dayLabels[idx] || ''}
                      label={{ value: 'Day', angle: -90, position: 'left' }}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 border rounded shadow-sm">
                              <div className="small">
                                <div className="fw-bold">{data.dateLabel}</div>
                                <div>{data.hourLabel}</div>
                                <div className="mt-1">
                                  <strong>Speed:</strong> {data.speed} km/hr
                                </div>
                                <div className="text-muted">
                                  {data.speed >= 3.6 && data.speed <= 5.0 ? '✓ Normal pace' : 
                                   data.speed > 5.0 ? '↑ Fast pace' : 
                                   '↓ Slow pace'}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter data={gaitHeatmapData}>
                      {gaitHeatmapData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={getSpeedColor(entry.speed)}
                          opacity={0.8}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Double Support Time Heatmap */}
        <Col lg={6}>
          <Card className="shadow-sm h-100">
            <Card.Header>
              <h6 className="mb-0">Double Support Time (%)</h6>
              <small className="text-muted">Hourly average - Normal range: 20-30%</small>
            </Card.Header>
            <Card.Body>
              <div style={{ width: "100%", height: 250 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      type="number" 
                      dataKey="hour" 
                      domain={[0, 23]}
                      ticks={[0, 4, 8, 12, 16, 20, 23]}
                      tickFormatter={(hour) => `${hour}:00`}
                      label={{ value: 'Hour of Day', position: 'bottom', offset: 0 }}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="dayIndex" 
                      domain={[0, maxDayIndex]}
                      ticks={dayTicks}
                      tickFormatter={(idx) => dayLabels[idx] || ''}
                      label={{ value: 'Day', angle: -90, position: 'left' }}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 border rounded shadow-sm">
                              <div className="small">
                                <div className="fw-bold">{data.dateLabel}</div>
                                <div>{data.hourLabel}</div>
                                <div className="mt-1">
                                  <strong>Double Support:</strong> {data.doubleSupport}%
                                </div>
                                <div className="text-muted">
                                  {data.doubleSupport >= 20 && data.doubleSupport <= 30 ? '✓ Normal gait' : 
                                   '~ Outside normal range'}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter data={gaitHeatmapData}>
                      {gaitHeatmapData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={getDoubleSupportColor(entry.doubleSupport)}
                          opacity={0.8}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Walking Step Length Heatmap */}
        <Col lg={6}>
            <Card className="shadow-sm h-100">
              <Card.Header>
                 <h6 className="mb-0">Walking Step Length (m)</h6>
                 <small className="text-muted">Hourly average - Normal range: 0.60-0.80 m</small>
              </Card.Header>
            <Card.Body>
              <div style={{ width: "100%", height: 250 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 10, left: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      type="number" 
                      dataKey="hour" 
                      domain={[0, 23]}
                      ticks={[0, 4, 8, 12, 16, 20, 23]}
                      tickFormatter={(hour) => `${hour}:00`}
                      label={{ value: 'Hour of Day', position: 'bottom', offset: 0 }}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="dayIndex" 
                      domain={[0, maxDayIndex]}
                      ticks={dayTicks}
                      tickFormatter={(idx) => dayLabels[idx] || ''}
                      label={{ value: 'Day', angle: -90, position: 'left' }}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-2 border rounded shadow-sm">
                              <div className="small">
                                <div className="fw-bold">{data.dateLabel}</div>
                                <div>{data.hourLabel}</div>
                                   <div className="mt-1">
                                     <strong>Step Length:</strong> {(data.stepLength)/100} m
                                   </div>
                                <div className="text-muted">
                                  {(data.stepLength/100) >= 0.60 && (data.stepLength/100) <= 0.80 ? '✓ Normal stride' : 
                                   (data.stepLength/100) > 0.80 ? '↑ Long stride' : 
                                   '↓ Short stride'}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter data={gaitHeatmapData}>
                      {gaitHeatmapData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={getStepLengthColor(entry.stepLength)}
                          opacity={0.8}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Daily Averages Summary */}
      <Row className="mt-4">
        <Col lg={12}>
          <Card className="shadow-sm">
            <Card.Header>
              <h6 className="mb-0">{dateRange}-Day Summary - Daily Averages</h6>
            </Card.Header>
            <Card.Body>
              <Row className="g-3">
                <Col md={3}>
                  <div className="text-center p-3 bg-light rounded">
                    <div className="small text-muted mb-1">Avg Walking Asymmetry</div>
                    <div className="h4 mb-0" style={{ color: getAsymmetryColor(weeklyAverages.asymmetry) }}>
                      {weeklyAverages.asymmetry}%
                    </div>
                    <div className="small text-muted">
                      {weeklyAverages.asymmetry < 2 ? '✓ Excellent' : 
                       weeklyAverages.asymmetry < 5 ? '~ Fair' : 
                       '⚠ High'}
                    </div>
                  </div>
                </Col>
                <Col md={3}>
                  <div className="text-center p-3 bg-light rounded">
                    <div className="small text-muted mb-1">Avg Walking Speed</div>
                    <div className="h4 mb-0" style={{ color: getSpeedColor(weeklyAverages.speed) }}>
                      {weeklyAverages.speed} km/hr
                    </div>
                    <div className="small text-muted">
                      {weeklyAverages.speed >= 3.6 && weeklyAverages.speed <= 5.0 ? '✓ Normal' : 
                       weeklyAverages.speed > 5.0 ? '↑ Fast' : 
                       '↓ Slow'}
                    </div>
                  </div>
                </Col>
                <Col md={3}>
                  <div className="text-center p-3 bg-light rounded">
                    <div className="small text-muted mb-1">Avg Double Support</div>
                    <div className="h4 mb-0" style={{ color: getDoubleSupportColor(weeklyAverages.doubleSupport) }}>
                      {weeklyAverages.doubleSupport}%
                    </div>
                    <div className="small text-muted">
                      {weeklyAverages.doubleSupport >= 20 && weeklyAverages.doubleSupport <= 30 ? '✓ Normal' : '~ Outside range'}
                    </div>
                  </div>
                </Col>
                <Col md={3}>
                  <div className="text-center p-3 bg-light rounded">
                      <div className="small text-muted mb-1">Avg Step Length</div>
                      <div className="h4 mb-0" style={{ color: getStepLengthColor(weeklyAverages.stepLength/100) }}>
                        {(weeklyAverages.stepLength/100).toFixed(2)} m
                      </div>
                    <div className="small text-muted">
                      {(weeklyAverages.stepLength/100) >= 0.60 && (weeklyAverages.stepLength/100) <= 0.80 ? '✓ Normal stride' : 
                       (weeklyAverages.stepLength/100) > 0.80 ? '↑ Long stride' : 
                       '↓ Short stride'}
                    </div>
                  </div>
                </Col>
              </Row>

              {/* Legend */}
              <div className="mt-3 pt-3 border-top">
                <div className="small text-muted">
                  <div className="mb-2"><strong>Color Legend:</strong></div>
                  <Row className="g-2">
                    <Col md={3}>
                      <div className="d-flex align-items-center justify-content-center gap-2">
                        <div style={{ width: 16, height: 16, backgroundColor: 'var(--bs-success)', borderRadius: 2 }}></div>
                        <span>Optimal / Normal</span>
                      </div>
                    </Col>
                    <Col md={3}>
                      <div className="d-flex align-items-center justify-content-center gap-2">
                        <div style={{ width: 16, height: 16, backgroundColor: 'var(--bs-info)', borderRadius: 2 }}></div>
                        <span>Above Normal (Speed/Step)</span>
                      </div>
                    </Col>
                    <Col md={3}>
                      <div className="d-flex align-items-center justify-content-center gap-2">
                        <div style={{ width: 16, height: 16, backgroundColor: 'var(--bs-warning)', borderRadius: 2 }}></div>
                        <span>Fair / Caution</span>
                      </div>
                    </Col>
                    <Col md={3}>
                      <div className="d-flex align-items-center justify-content-center gap-2">
                        <div style={{ width: 16, height: 16, backgroundColor: 'var(--bs-danger)', borderRadius: 2 }}></div>
                        <span>Needs Attention</span>
                      </div>
                    </Col>
                  </Row>
                </div>
              </div>

              {/* Daily breakdown table */}
              <div className="mt-3 pt-3 border-top">
                <div className="small">
                  <strong>Daily Breakdown:</strong>
                  <div className="table-responsive mt-2">
                    <table className="table table-sm table-hover">
                      <thead>
                        <tr className="text-muted">
                          <th>Date</th>
                          <th className="text-end">Asymmetry (%)</th>
                          <th className="text-end">Speed (km/hr)</th>
                          <th className="text-end">Double Support (%)</th>
                           <th className="text-end">Step Length (m)</th>
                          <th className="text-end">Steps</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyAverages.map(day => (
                          <tr key={day.date}>
                            <td>{day.dateLabel}</td>
                            <td className="text-end" style={{ color: getAsymmetryColor(day.avgAsymmetry) }}>
                              {day.avgAsymmetry > 0 ? day.avgAsymmetry : '—'}
                            </td>
                            <td className="text-end" style={{ color: getSpeedColor(day.avgSpeed) }}>
                              {day.avgSpeed > 0 ? day.avgSpeed : '—'}
                            </td>
                            <td className="text-end" style={{ color: getDoubleSupportColor(day.avgDoubleSupport) }}>
                              {day.avgDoubleSupport > 0 ? day.avgDoubleSupport : '—'}
                            </td>
                             <td className="text-end" style={{ color: getStepLengthColor(day.avgStepLength/100) }}>
                               {day.avgStepLength > 0 ? (day.avgStepLength/100).toFixed(2) : '—'}
                             </td>
                            <td className="text-end">{day.totalSteps.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Gait Insight Cards */}
      <Row className="mt-4">
        <Col lg={12}>
          {gaitInsights.showFallRiskInsights ? (
            <>
              <Card className="shadow-sm mb-3">
                <Card.Body>
                  <h6 className="text-muted mb-2">💪 Walking Gait Insight</h6>
                  <div className="small">
                    <div className="fw-bold text-warning mb-1">Strength training keeps your muscles and bones strong and helps lower your risk of falls.</div>
                  </div>
                </Card.Body>
              </Card>
              
              <Card className="shadow-sm mb-3">
                <Card.Body>
                  <h6 className="text-muted mb-2">💪 Walking Gait Insight</h6>
                  <div className="small">
                    <div className="fw-bold text-warning mb-1">Start with light weights or bodyweight exercises to allow your muscles to adapt.</div>
                  </div>
                </Card.Body>
              </Card>
              
              <Card className="shadow-sm mb-3">
                <Card.Body>
                  <h6 className="text-muted mb-2">💪 Walking Gait Insight</h6>
                  <div className="small">
                    <div className="fw-bold text-warning mb-1">Aim for 10 to 15 repetitions - For instance, squats (bodyweight exercise example) and bicep curls (light weights exercise example).</div>
                  </div>
                </Card.Body>
              </Card>
              
              <Card className="shadow-sm mb-3">
                <Card.Body>
                  <h6 className="text-muted mb-2">⚖️ Walking Gait Insight</h6>
                  <div className="small">
                    <div className="fw-bold text-info mb-1">Balance activities, such as tai chi or heel to toe walking can help improve your balance.</div>
                  </div>
                </Card.Body>
              </Card>
              
              <Card className="shadow-sm mb-3">
                <Card.Body>
                  <h6 className="text-muted mb-2">⚖️ Walking Gait Insight</h6>
                  <div className="small">
                    <div className="fw-bold text-info mb-1">Balance exercises can also help you become more aware of how your body moves, and help improve your control over basic movements.</div>
                  </div>
                </Card.Body>
              </Card>
              
              <Card className="shadow-sm">
                <Card.Body>
                  <h6 className="text-muted mb-2">⚖️ Walking Gait Insight</h6>
                  <div className="small">
                    <div className="fw-bold text-info mb-1">Simple actions, such as taking the stairs or standing on one leg can make a difference.</div>
                  </div>
                </Card.Body>
              </Card>
            </>
          ) : (
            <Card className="shadow-sm">
              <Card.Body>
                <h6 className="text-muted mb-2">✅ Walking Gait Insight</h6>
                <div className="small">
                  <div className="fw-bold text-success mb-1">Older adult user is not currently prone to falling:</div>
                  <div className="text-muted">The likelihood of a falling incident is lower than average → Continue moving regularly to maintain your physical capabilities and functionality and uphold your current quality of life</div>
                </div>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}
