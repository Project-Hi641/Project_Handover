
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card, Row, Col, Alert, Spinner, Button, Carousel } from "react-bootstrap";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea } from "recharts";
import "../css/dashboard.css";
import { useAuth } from "../contexts/AuthContext";
import { auth } from "../services/Firebase";
import HypnogramPopup from "../components/HypnogramPopup";
import ActivityRings, { ActivityRingsLegend } from "../components/ActivityRings";
import WalkingGaitHeatmap from "../components/WalkingGaitHeatmap";

function Dashboard() {
  const { currentUser } = useAuth();
  const display = currentUser?.displayName || currentUser?.email || "there";
  
  // State for health data
  const [stepsData, setStepsData] = useState([]);
  const [heartData, setHeartData] = useState([]);
  const [restingHeartRateData, setRestingHeartRateData] = useState([]);
  const [sleepData, setSleepData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // State for activity rings data
  const [standMinutesData, setStandMinutesData] = useState([]);
  const [hrvData, setHrvData] = useState([]);
  const [restingEnergyData, setRestingEnergyData] = useState([]);
  const [activeEnergyData, setActiveEnergyData] = useState([]);
  
  // State for walking gait analysis data
  const [walkingAsymmetryData, setWalkingAsymmetryData] = useState([]);
  const [walkingSpeedData, setWalkingSpeedData] = useState([]);
  const [doubleSupportTimeData, setDoubleSupportTimeData] = useState([]);
  const [walkingStepLengthData, setWalkingStepLengthData] = useState([]);
  
  // State for user profile (to get age for HRV goal)
  const [userProfile, setUserProfile] = useState(null);
  
  // State for hypnogram popup
  const [showHypnogramPopup, setShowHypnogramPopup] = useState(false);

  // Fetch health data from the last 30 days
  const fetchHealthData = useCallback(async () => {
    if (!currentUser) return;
    try {
      setLoading(true);
      setError("");
      
      const token = await auth.currentUser.getIdToken();
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 30); // Last 30 days
      
      const makeReq = (type) =>
        fetch(`/api/health?${new URLSearchParams({
          type,
          from: from.toISOString(),
          to: to.toISOString(),
          limit: "1000",
        })}`, { headers: { Authorization: `Bearer ${token}` } });

      const [
        stepsResponse, heartResponse, restingHeartRateResponse, sleepResponse,
        standMinutesResponse, hrvResponse, restingEnergyResponse, activeEnergyResponse,
        walkingAsymmetryResponse, walkingSpeedResponse, doubleSupportTimeResponse, walkingStepLengthResponse
      ] = await Promise.all([
        makeReq("steps"),
        makeReq("heart_rate"),
        makeReq("resting_heart_rate"),
        makeReq("sleep"),
        makeReq("stand_minutes"),
        makeReq("heart_rate_variability"),
        makeReq("resting_energy"),
        makeReq("active_energy"),
        makeReq("walking_asymmetry"),
        makeReq("walking_speed"),
        makeReq("double_support_time"),
        makeReq("walking_step_length"),
      ]);

      const okAll = [
        stepsResponse, heartResponse, restingHeartRateResponse, sleepResponse,
        standMinutesResponse, hrvResponse, restingEnergyResponse, activeEnergyResponse,
        walkingAsymmetryResponse, walkingSpeedResponse, doubleSupportTimeResponse, walkingStepLengthResponse
      ].every(r => r.ok);

      if (!okAll) {
        const firstBad = [
          stepsResponse, heartResponse, restingHeartRateResponse, sleepResponse,
          standMinutesResponse, hrvResponse, restingEnergyResponse, activeEnergyResponse,
          walkingAsymmetryResponse, walkingSpeedResponse, doubleSupportTimeResponse, walkingStepLengthResponse
        ].find(r => !r.ok);
        throw new Error(`Failed to fetch data (status ${firstBad?.status || "?"})`);
      }
      
      const [
        stepsJson, heartJson, restingHeartRateJson, sleepJson,
        standMinutesJson, hrvJson, restingEnergyJson, activeEnergyJson,
        walkingAsymmetryJson, walkingSpeedJson, doubleSupportTimeJson, walkingStepLengthJson
      ] = await Promise.all([
        stepsResponse.json(),
        heartResponse.json(),
        restingHeartRateResponse.json(),
        sleepResponse.json(),
        standMinutesResponse.json(),
        hrvResponse.json(),
        restingEnergyResponse.json(),
        activeEnergyResponse.json(),
        walkingAsymmetryResponse.json(),
        walkingSpeedResponse.json(),
        doubleSupportTimeResponse.json(),
        walkingStepLengthResponse.json()
      ]);
      
      setStepsData(stepsJson.items || []);
      setHeartData(heartJson.items || []);
      setRestingHeartRateData(restingHeartRateJson.items || []);
      setSleepData(sleepJson.items || []);
      setStandMinutesData(standMinutesJson.items || []);
      setHrvData(hrvJson.items || []);
      setRestingEnergyData(restingEnergyJson.items || []);
      setActiveEnergyData(activeEnergyJson.items || []);
      setWalkingAsymmetryData(walkingAsymmetryJson.items || []);
      setWalkingSpeedData(walkingSpeedJson.items || []);
      setDoubleSupportTimeData(doubleSupportTimeJson.items || []);
      setWalkingStepLengthData(walkingStepLengthJson.items || []);
    } catch (err) {
      console.error("Error fetching health data:", err);
      setError(err.message || "Failed to load health data");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  // Process steps data for the chart with rolling averages
  const stepsChartData = useMemo(() => {
    if (!stepsData.length) return [];
    const dailySteps = {};
    stepsData.forEach(item => {
      const date = new Date(item.ts).toISOString().slice(0, 10);
      const steps = typeof item.value === "number" ? item.value : Number(item.value) || 0;
      dailySteps[date] = (dailySteps[date] || 0) + steps;
    });
    const sortedData = Object.entries(dailySteps)
      .map(([date, steps]) => ({
        date,
        steps,
        label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const dataWith7DayAvg = sortedData.map((item, index) => {
      if (index < 6) return { ...item, avg7Day: null };
      const last7Days = sortedData.slice(index - 6, index + 1);
      const avg7Day = last7Days.reduce((sum, day) => sum + day.steps, 0) / 7;
      return { ...item, avg7Day: Math.round(avg7Day) };
    });
    const dataWith21DayAvg = dataWith7DayAvg.map((item, index) => {
      if (index < 20) return { ...item, avg21Day: null };
      const last21Days = sortedData.slice(index - 20, index + 1);
      const avg21Day = last21Days.reduce((sum, day) => sum + day.steps, 0) / 21;
      return { ...item, avg21Day: Math.round(avg21Day) };
    });
    return dataWith21DayAvg;
  }, [stepsData]);

  // Process heart rate data by activity intensity zones
  const heartChartData = useMemo(() => {
    if (!heartData.length) return [];
    const timestampRestingHR = {};
    restingHeartRateData.forEach(item => {
      const timestamp = new Date(item.ts).toISOString();
      const value = typeof item.value === "number" ? item.value : Number(item.value);
      if (Number.isFinite(value)) {
        if (!timestampRestingHR[timestamp]) timestampRestingHR[timestamp] = [];
        timestampRestingHR[timestamp].push(value);
      }
    });
    const processedRestingHR = {};
    Object.entries(timestampRestingHR).forEach(([timestamp, values]) => {
      const date = timestamp.slice(0, 10);
      if (!processedRestingHR[date]) processedRestingHR[date] = { values: [], min: Infinity, max: -Infinity };
      const tsMin = Math.min(...values);
      const tsMax = Math.max(...values);
      processedRestingHR[date].min = Math.min(processedRestingHR[date].min, tsMin);
      processedRestingHR[date].max = Math.max(processedRestingHR[date].max, tsMax);
      processedRestingHR[date].values.push(...values);
    });
    Object.keys(processedRestingHR).forEach(date => {
      const { values, min, max } = processedRestingHR[date];
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      processedRestingHR[date] = { avg: Math.round(avg), min: Math.round(min), max: Math.round(max) };
    });
    const allRestingHRAvgs = Object.values(processedRestingHR).map(d => d.avg);
    const overallAvgRestingHR = allRestingHRAvgs.length > 0
      ? Math.round(allRestingHRAvgs.reduce((sum, hr) => sum + hr, 0) / allRestingHRAvgs.length)
      : 75;
    const allRestingHRMaxes = Object.values(processedRestingHR).map(d => d.max);
    const highestRestingHR = allRestingHRMaxes.length > 0
      ? Math.max(...allRestingHRMaxes)
      : overallAvgRestingHR;

    const maxHR = userProfile?.dob 
      ? 220 - calculateAge(userProfile.dob)
      : 155;
    const restZoneEnd = Math.round(maxHR * 0.50);
    const lightZoneStart = restZoneEnd;
    const lightZoneEnd = Math.round(maxHR * 0.65);
    const moderateZoneEnd = Math.round(maxHR * 0.75);
    const hardZoneEnd = Math.round(maxHR * 0.95);
    
    const dailyHeart = {};
    heartData.forEach(item => {
      const v = typeof item.value === "number" ? item.value : Number(item.value);
      if (!Number.isFinite(v)) return;
      const date = new Date(item.ts).toISOString().slice(0, 10);
      const restingHRData = processedRestingHR[date];
      const restZoneThreshold = restingHRData ? restingHRData.avg : overallAvgRestingHR;
      if (!dailyHeart[date]) {
        dailyHeart[date] = { 
          overall: { sum: 0, count: 0, max: 0, min: Infinity },
          rest: { sum: 0, count: 0, max: 0, min: Infinity },
          light: { sum: 0, count: 0, max: 0, min: Infinity },
          moderate: { sum: 0, count: 0, max: 0, min: Infinity },
          hard: { sum: 0, count: 0, max: 0, min: Infinity },
          restingHR: restZoneThreshold,
          restingHRMin: restingHRData ? restingHRData.min : restZoneThreshold,
          restingHRMax: restingHRData ? restingHRData.max : restZoneThreshold
        };
      }
      dailyHeart[date].overall.sum += v;
      dailyHeart[date].overall.count += 1;
      dailyHeart[date].overall.max = Math.max(dailyHeart[date].overall.max, v);
      dailyHeart[date].overall.min = Math.min(dailyHeart[date].overall.min, v);
      if (v < restZoneEnd) {
        dailyHeart[date].rest.sum += v;
        dailyHeart[date].rest.count += 1;
        dailyHeart[date].rest.max = Math.max(dailyHeart[date].rest.max, v);
        dailyHeart[date].rest.min = Math.min(dailyHeart[date].rest.min, v);
      } else if (v >= lightZoneStart && v <= lightZoneEnd) {
        dailyHeart[date].light.sum += v;
        dailyHeart[date].light.count += 1;
        dailyHeart[date].light.max = Math.max(dailyHeart[date].light.max, v);
        dailyHeart[date].light.min = Math.min(dailyHeart[date].light.min, v);
      } else if (v > lightZoneEnd && v <= moderateZoneEnd) {
        dailyHeart[date].moderate.sum += v;
        dailyHeart[date].moderate.count += 1;
        dailyHeart[date].moderate.max = Math.max(dailyHeart[date].moderate.max, v);
        dailyHeart[date].moderate.min = Math.min(dailyHeart[date].moderate.min, v);
      } else if (v > moderateZoneEnd && v <= hardZoneEnd) {
        dailyHeart[date].hard.sum += v;
        dailyHeart[date].hard.count += 1;
        dailyHeart[date].hard.max = Math.max(dailyHeart[date].hard.max, v);
        dailyHeart[date].hard.min = Math.min(dailyHeart[date].hard.min, v);
      }
    });
    const chartData = Object.entries(dailyHeart)
      .map(([date, zones]) => ({
        date,
        label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        overall: zones.overall.count > 0 ? Math.round(zones.overall.sum / zones.overall.count) : 0,
        rest: zones.rest.count > 0 ? Math.round(zones.rest.sum / zones.rest.count) : 0,
        light: zones.light.count > 0 ? Math.round(zones.light.sum / zones.light.count) : 0,
        moderate: zones.moderate.count > 0 ? Math.round(zones.moderate.sum / zones.moderate.count) : 0,
        hard: zones.hard.count > 0 ? Math.round(zones.hard.sum / zones.hard.count) : 0,
        maxBpm: zones.overall.max,
        minBpm: zones.overall.min === Infinity ? 0 : zones.overall.min,
        restingHR: zones.restingHR,
        restingHRMin: zones.restingHRMin,
        restingHRMax: zones.restingHRMax
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    chartData.zoneThresholds = {
      avgRestingHR: overallAvgRestingHR,
      highestRestingHR,
      restZoneEnd,
      lightZoneStart,
      lightZoneEnd,
      moderateZoneEnd,
      hardZoneEnd,
      maxHR,
      userAge: userProfile?.dob ? calculateAge(userProfile.dob) : null
    };
    return chartData;
  }, [heartData, restingHeartRateData, userProfile]);

  // Separate datasets by zone for charts
  const heartRateZones = useMemo(() => ({
    overall: heartChartData.map(day => ({ ...day, bpm: day.overall })),
    rest: heartChartData.filter(day => day.rest > 0).map(day => ({ ...day, bpm: day.rest })),
    light: heartChartData.filter(day => day.light > 0).map(day => ({ ...day, bpm: day.light })),
    moderate: heartChartData.filter(day => day.moderate > 0).map(day => ({ ...day, bpm: day.moderate })),
    hard: heartChartData.filter(day => day.hard > 0).map(day => ({ ...day, bpm: day.hard }))
  }), [heartChartData]);

  const avgRestingHeartRate = useMemo(() => {
    if (!heartChartData.length) return 75;
    const restingHRs = heartChartData.map(day => day.restingHR).filter(hr => hr > 0);
    if (restingHRs.length === 0) return 75;
    return Math.round(restingHRs.reduce((sum, hr) => sum + hr, 0) / restingHRs.length);
  }, [heartChartData]);

  const highestRestingHeartRate = useMemo(() => {
    if (!heartChartData.length || !heartChartData.zoneThresholds) return 75;
    return heartChartData.zoneThresholds.highestRestingHR || 75;
  }, [heartChartData]);

  // Sleep chart data
  const sleepChartData = useMemo(() => {
    if (!sleepData.length) return [];
    const dailySleep = {};
    sleepData.forEach(item => {
      const mins = typeof item.value === "number" ? item.value : Number(item.value);
      if (!Number.isFinite(mins)) return;
      const stage = canonicalStage(item?.payload?.stage);
      if (stage === "In bed") return;
      const date = new Date(item.ts).toISOString().slice(0, 10);
      if (!dailySleep[date]) dailySleep[date] = { REM: 0, Core: 0, Deep: 0, Awake: 0 };
      if (stage === "REM" || stage === "Core" || stage === "Deep" || stage === "Awake") {
        dailySleep[date][stage] = (dailySleep[date][stage] || 0) + mins;
      }
    });
    return Object.entries(dailySleep)
      .map(([date, stages]) => ({
        date,
        label: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        REM: Math.round((stages.REM / 60) * 10) / 10,
        Core: Math.round((stages.Core / 60) * 10) / 10,
        Deep: Math.round((stages.Deep / 60) * 10) / 10,
        Awake: Math.round((stages.Awake / 60) * 10) / 10,
        total: Math.round(((stages.REM + stages.Core + stages.Deep + stages.Awake) / 60) * 10) / 10
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sleepData]);

  // Steps stats
  const stepsStats = useMemo(() => {
    if (!stepsChartData.length) return { total: 0, average: 0, bestDay: null };
    const total = stepsChartData.reduce((sum, day) => sum + day.steps, 0);
    const average = Math.round(total / stepsChartData.length);
    const bestDay = stepsChartData.reduce((best, day) => day.steps > (best?.steps || 0) ? day : best, null);
    return { total, average, bestDay };
  }, [stepsChartData]);

  // Heart zone stats
  const heartZoneStats = useMemo(() => {
    const stats = {
      overall: { average: 0, max: 0, min: 0, count: 0 },
      rest: { average: 0, max: 0, min: 0, count: 0 },
      light: { average: 0, max: 0, min: 0, count: 0 },
      moderate: { average: 0, max: 0, min: 0, count: 0 },
      hard: { average: 0, max: 0, min: 0, count: 0 }
    };
    if (heartChartData.length === 0) return stats;
    Object.keys(stats).forEach(zone => {
      const data = heartRateZones[zone];
      if (data.length > 0) {
        const bpms = data.map(day => day.bpm);
        stats[zone] = {
          average: Math.round(bpms.reduce((sum, bpm) => sum + bpm, 0) / bpms.length),
          max: Math.max(...bpms),
          min: Math.min(...bpms),
          count: data.length
        };
      }
    });
    return stats;
  }, [heartChartData, heartRateZones]);

  // Sleep stats
  const sleepStats = useMemo(() => {
    if (!sleepChartData.length) {
      return { 
        total: 0, average: 0, longest: null, shortest: null,
        stageAverages: { REM: 0, Core: 0, Deep: 0, Awake: 0 },
        stagePercentages: { REM: 0, Core: 0, Deep: 0, Awake: 0 },
        sleepInsights: { showSleepDurationInsight: false, showDeepSleepInsight: false, showREMSleepInsight: false, showGeneralTips: false, averageHours: 0, deepSleepPercent: 0, remSleepPercent: 0 }
      };
    }
    const allTotals = sleepChartData.map(day => day.total);
    const totalHours = Math.round(allTotals.reduce((sum, hours) => sum + hours, 0) * 10) / 10;
    const averageHours = Math.round((totalHours / allTotals.length) * 10) / 10;
    const longest = sleepChartData.reduce((best, day) => day.total > (best?.total || 0) ? day : best, null);
    const shortest = sleepChartData.reduce((best, day) => day.total < (best?.total || Infinity) ? day : best, null);
    const stageAverages = {
      REM: Math.round((sleepChartData.reduce((sum, day) => sum + day.REM, 0) / sleepChartData.length) * 10) / 10,
      Core: Math.round((sleepChartData.reduce((sum, day) => sum + day.Core, 0) / sleepChartData.length) * 10) / 10,
      Deep: Math.round((sleepChartData.reduce((sum, day) => sum + day.Deep, 0) / sleepChartData.length) * 10) / 10,
      Awake: Math.round((sleepChartData.reduce((sum, day) => sum + day.Awake, 0) / sleepChartData.length) * 10) / 10
    };
    const stagePercentages = {
      REM: averageHours > 0 ? Math.round((stageAverages.REM / averageHours) * 100) : 0,
      Core: averageHours > 0 ? Math.round((stageAverages.Core / averageHours) * 100) : 0,
      Deep: averageHours > 0 ? Math.round((stageAverages.Deep / averageHours) * 100) : 0,
      Awake: averageHours > 0 ? Math.round((stageAverages.Awake / averageHours) * 100) : 0
    };
    const showSleepDurationInsight = averageHours < 7 || averageHours > 9;
    const showDeepSleepInsight = stagePercentages.Deep < 13;
    const showREMSleepInsight = stagePercentages.REM < 20;
    const showGeneralTips = showSleepDurationInsight || showDeepSleepInsight || showREMSleepInsight;
    const sleepInsights = {
      showSleepDurationInsight,
      showDeepSleepInsight,
      showREMSleepInsight,
      showGeneralTips,
      averageHours,
      deepSleepPercent: stagePercentages.Deep,
      remSleepPercent: stagePercentages.REM
    };
    return { 
      total: totalHours, average: averageHours, longest, shortest,
      stageAverages, stagePercentages, sleepInsights
    };
  }, [sleepChartData]);

  // Activity rings (last 7 days)
  const activityRingsData = useMemo(() => {
    const aggregateByDay = (data) => {
      const dailyData = {};
      data.forEach(item => {
        const date = new Date(item.ts).toISOString().slice(0, 10);
        const value = typeof item.value === "number" ? item.value : Number(item.value);
        if (!Number.isNaN(value)) dailyData[date] = (dailyData[date] || 0) + value;
      });
      return dailyData;
    };
    const averageByDay = (data) => {
      const dailyData = {};
      data.forEach(item => {
        const date = new Date(item.ts).toISOString().slice(0, 10);
        const value = typeof item.value === "number" ? item.value : Number(item.value);
        if (!Number.isNaN(value)) {
          if (!dailyData[date]) dailyData[date] = { sum: 0, count: 0 };
          dailyData[date].sum += value;
          dailyData[date].count += 1;
        }
      });
      const result = {};
      Object.entries(dailyData).forEach(([date, { sum, count }]) => {
        result[date] = sum / count;
      });
      return result;
    };
    const standHoursByDay = (data) => {
      const dailyData = {};
      data.forEach(item => {
        const timestamp = new Date(item.ts);
        const date = timestamp.toISOString().slice(0, 10);
        const hour = timestamp.getHours();
        const value = typeof item.value === "number" ? item.value : Number(item.value);
        if (!Number.isNaN(value) && value >= 1) {
          if (!dailyData[date]) dailyData[date] = new Set();
          dailyData[date].add(hour);
        }
      });
      const result = {};
      Object.entries(dailyData).forEach(([date, hourSet]) => {
        result[date] = hourSet.size;
      });
      return result;
    };
    const standHoursByDayData = standHoursByDay(standMinutesData);
    const hrvByDay = averageByDay(hrvData);
    const restingEnergyByDay = aggregateByDay(restingEnergyData);
    const activeEnergyByDay = aggregateByDay(activeEnergyData);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().slice(0, 10));
    }
    return last7Days.map(date => ({
      date,
      label: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }),
      standHours: standHoursByDayData[date] || 0,
      hrv: hrvByDay[date] || 0,
      activeEnergy: activeEnergyByDay[date] || 0,
      restingEnergy: restingEnergyByDay[date] || 0,
      totalEnergy: (activeEnergyByDay[date] || 0) + (restingEnergyByDay[date] || 0)
    }));
  }, [standMinutesData, hrvData, restingEnergyData, activeEnergyData]);

  // User profile
  const fetchUserProfile = useCallback(async () => {
    if (!currentUser) return;
    try {
      const token = await auth.currentUser.getIdToken();
      const uid = auth.currentUser.uid;
      const res = await fetch(`/api/users?id=${encodeURIComponent(uid)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
      }
    } catch (err) {
      console.error("Error fetching user profile:", err);
    }
  }, [currentUser]);

  // Helpers
  const calculateAge = (dob) => {
    if (!dob) return null;
    try {
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      return age;
    } catch { return null; }
  };
  const getHRVRange = (age) => {
    if (!age || age < 18) return [0, 90];
    if (age <= 25) return [60, 90];
    if (age <= 35) return [55, 80];
    if (age <= 45) return [50, 70];
    if (age <= 55) return [45, 65];
    if (age <= 65) return [40, 60];
    if (age <= 75) return [35, 55];
    if (age <= 85) return [30, 50];
    if (age <= 95) return [25, 45];
    return [25, 45];
  };
  const calculateHRVPercent = (hrv, ageRange) => {
    const [min, max] = ageRange;
    if (hrv < min) return Math.max(0, (hrv / min) * 50);
    if (hrv <= max) return 50 + ((hrv - min) / (max - min)) * 50;
    return 100;
  };

  // Age/range memo
  const userAge = useMemo(() => (userProfile?.dob ? calculateAge(userProfile.dob) : null), [userProfile]);
  const hrvRange = useMemo(() => getHRVRange(userAge), [userAge]);
  const [hrvMin, hrvMax] = hrvRange;

  const getEnergyNeedsRange = (age, gender) => {
    if (!age || !gender) return null;
    const g = String(gender).toLowerCase();
    if (g === 'male') {
      if (age >= 56 && age <= 60) return [9200, 10900];
      if (age <= 65) return [8400, 10900];
      if (age <= 75) return [8400, 10900];
      return [8400, 10500];
    }
    if (g === 'female') {
      if (age >= 56 && age <= 60) return [6700, 9200];
      if (age <= 65) return [6700, 8400];
      return [6700, 7900];
    }
    return null;
  };

  // Standing analysis
  const standAnalysis = useMemo(() => {
    const dailyStandingMinutes = {};
    standMinutesData.forEach(item => {
      const date = new Date(item.ts).toISOString().slice(0, 10);
      const value = typeof item.value === "number" ? item.value : Number(item.value);
      if (!Number.isNaN(value)) dailyStandingMinutes[date] = (dailyStandingMinutes[date] || 0) + value;
    });
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().slice(0, 10));
    }
    const dailyTotals = last7Days.map(date => dailyStandingMinutes[date] || 0);
    const validDays = dailyTotals.filter(total => total > 0);
    if (validDays.length === 0) return { avgTotalMinutes: 0, avgMinutesPerHour: 0, status: 'unknown', insights: [] };
    const avgTotalMinutes = validDays.reduce((sum, total) => sum + total, 0) / validDays.length;
    const avgMinutesPerHour = avgTotalMinutes / 24;
    let status, insights;
    if (avgMinutesPerHour < 10 && avgTotalMinutes < 120) {
      status = 'below';
      insights = [
        { icon: '⚠️', title: 'Health Risks of Prolonged Sitting', text: 'Prolonged sitting can contribute to the development of type 2 diabetes and weight gain, higher blood pressure, increased risk of cardiovascular disease and stroke, decreased energy levels and productivity.' },
        { icon: '⏰', title: 'Hourly Movement Goal', text: 'Aim to stand and move for at least 10 minutes every hour.' },
        { icon: '💡', title: 'Simple Activities', text: 'Get some water, stretch, take a short walk inside or around your home.' },
      ];
    } else if (avgMinutesPerHour >= 10 && avgTotalMinutes >= 120) {
      status = 'good';
      insights = [
        { icon: '✅', title: 'Great Standing Activity', text: 'Keep moving regularly to close your activity rings.' },
        { icon: '🚶', title: 'Continue Active Habits', text: 'Get some water, stretch, take a short walk inside or around your home.' },
      ];
    } else {
      status = 'partial';
      insights = [
        { icon: '📊', title: 'Making Progress', text: avgMinutesPerHour >= 10 ? 'Good hourly standing frequency. Try to increase your total daily standing time.' : 'Good total standing time. Try to distribute it more evenly throughout the day.' },
        { icon: '🎯', title: 'Target Goals', text: 'Aim for both 120+ minutes per day and 10+ minutes per hour for optimal health benefits.' },
      ];
    }
    return { avgTotalMinutes, avgMinutesPerHour, status, insights };
  }, [standMinutesData]);

  // HRV analysis
  const hrvAnalysis = useMemo(() => {
    const validHRVs = activityRingsData.filter(d => d.hrv > 0).map(d => d.hrv);
    if (validHRVs.length === 0) return { average: 0, status: 'unknown', insights: [] };
    const average = validHRVs.reduce((sum, hrv) => sum + hrv, 0) / validHRVs.length;
    let status, insights;
    if (average > hrvMax) {
      status = 'above';
      insights = [
        { icon: '💪', title: 'Enhanced Stress Resilience', text: 'Your well-balanced nervous system helps you recover more quickly from stressors.' },
        { icon: '🏃', title: 'Good Physical Fitness', text: 'You appear to be getting plenty of regular exercise.' },
        { icon: '🧘', title: 'Better Mental Well-being', text: 'You have a tendency to experience fewer symptoms of anxiety and depression.' },
        { icon: '❤️', title: 'Cardiovascular Health', text: 'You appear to be at a lower risk of heart disease.' },
      ];
    } else if (average >= hrvMin && average <= hrvMax) {
      status = 'normal';
      insights = [
        { icon: '✅', title: 'Healthy HRV Range', text: 'A sign of robust cardiovascular health and nervous system balance.' },
        { icon: '🎯', title: 'Keep It Up', text: 'Continue practices that promote high HRV such as regular physical activity, stress management techniques, and mindfulness.' },
      ];
    } else {
      status = 'below';
      insights = [
        { icon: '⚠️', title: 'Low HRV Detected', text: 'A sign of increased stress, fatigue, and at higher risk of various health conditions.' },
        { icon: '🔍', title: 'Possible Causes', text: 'Excessive or lack of training, inadequate sleep, onset of illness, suboptimal dietary habits, and insufficient hydration.' },
        { icon: '💡', title: 'Recommendations', text: 'Add practices that promote high HRV: regular physical activity, stress management techniques, and mindfulness.' },
      ];
    }
    return { average, status, insights };
  }, [activityRingsData, hrvMin, hrvMax]);

  // Energy analysis
  const energyAnalysis = useMemo(() => {
    const validEnergies = activityRingsData.filter(d => d.totalEnergy > 0).map(d => d.totalEnergy);
    if (validEnergies.length === 0) return { average: 0, status: 'unknown', insights: [], range: null };
    const average = validEnergies.reduce((sum, energy) => sum + energy, 0) / validEnergies.length;
    const energyRange = getEnergyNeedsRange(userAge, userProfile?.gender);
    if (!energyRange) return { average, status: 'unknown', insights: [], range: null };
    const [minNeeds, maxNeeds] = energyRange;
    let status, insights;
    if (average > maxNeeds) {
      status = 'above';
      insights = [
        { icon: '⚡', title: 'High Energy Expenditure', text: 'Your total daily energy expenditure exceeds typical needs for your age and gender.' },
        { icon: '🏋️', title: 'Active Lifestyle', text: 'You may be engaging in high levels of physical activity or have an elevated metabolic rate.' },
        { icon: '🍽️', title: 'Nutrition Consideration', text: 'Ensure adequate caloric intake to support your activity level and prevent energy deficit.' },
      ];
    } else if (average >= minNeeds && average <= maxNeeds) {
      status = 'normal';
      insights = [
        { icon: '✅', title: 'Balanced Energy Expenditure', text: 'Your total daily energy expenditure is within the healthy range for your age and gender.' },
        { icon: '⚖️', title: 'Maintain Balance', text: 'Continue maintaining a balance between energy intake and expenditure.' },
      ];
    } else {
      status = 'below';
      insights = [
        { icon: '📉', title: 'Low Energy Expenditure', text: 'Your total daily energy expenditure is below typical needs for your age and gender.' },
        { icon: '🚶', title: 'Increase Activity', text: 'Consider incorporating more physical activity into your daily routine.' },
        { icon: '💡', title: 'Health Benefits', text: 'Increasing activity can improve cardiovascular health, muscle strength, and overall well-being.' },
      ];
    }
    return { average, status, insights, range: energyRange };
  }, [activityRingsData, userAge, userProfile]);

  // Load data
  useEffect(() => {
    fetchHealthData();
    fetchUserProfile();
  }, [fetchHealthData, fetchUserProfile]);

  return (
    <div className="dashboard-root">
      <div className="dashboard-main">
        <section className="dashboard-content">
          <div className="mb-4">
            <h2 className="mb-1">Welcome back, {display}!</h2>
            <p className="text-muted">Here's your health data overview for the last 30 days</p>
            <div className="d-flex align-items-center gap-2 mt-2">
              <span className="badge" style={{ background: 'var(--chart-steps, var(--accent))', color: 'var(--on-accent, #fff)' }}>Steps</span>
              <span className="badge" style={{ background: 'var(--chart-hr-hard, var(--bs-danger))', color: 'var(--on-accent, #fff)' }}>Heart Rate Zones</span>
              <span className="badge" style={{ background: 'var(--chart-sleep-deep, #a78bfa)', color: 'var(--on-accent, #fff)' }}>Sleep</span>
              <span className="badge" style={{ background: 'var(--ring-energy, var(--bs-success))', color: 'var(--on-accent, #fff)' }}>Activity Rings</span>
              <span className="badge" style={{ background: 'var(--heatmap-accent, var(--bs-info))', color: 'var(--on-accent, #fff)' }}>Walking Gait Analysis</span>
              <small className="text-muted ms-2">← Swipe or use arrows to navigate</small>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
              </Spinner>
              <p className="mt-2 text-muted">Loading your health data...</p>
            </div>
          ) : error ? (
            <Alert variant="danger">
              <Alert.Heading>Unable to load data</Alert.Heading>
              <p>{error}</p>
              <Button variant="outline-danger" onClick={fetchHealthData}>
                Try Again
              </Button>
            </Alert>
          ) : (
            <div className="mb-4">
              {/* Health Data Carousel */}
              <Carousel 
                indicators
                controls
                interval={10000}
                pause="hover"
                className="health-carousel"
              >
                {/* Steps Chart Slide */}
                <Carousel.Item>
                  <Row className="g-4">
                    <Col lg={8}>
                      <Card className="shadow-sm">
                        <Card.Header>
                          <h5 className="mb-0">Steps Over Time</h5>
                          <small className="text-muted">Last 30 days</small>
                        </Card.Header>
                        <Card.Body>
                          {stepsChartData.length > 0 ? (
                            <div style={{ width: "100%", height: 300 }}>
                              <ResponsiveContainer>
                                <LineChart data={stepsChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                                  <YAxis tick={{ fontSize: 12 }} />
                                  <Tooltip 
                                    formatter={(value, name) => {
                                      if (name === 'steps') return [value.toLocaleString(), "Daily Steps"];
                                      if (name === 'avg7Day') return [value.toLocaleString(), "7-Day Average (Current Trend)"];
                                      if (name === 'avg21Day') return [value.toLocaleString(), "21-Day Average (Build a Habit)"];
                                      return [value.toLocaleString(), name];
                                    }}
                                    labelFormatter={(label) => `Date: ${label}`}
                                  />
                                  <Legend />
                                  <Line type="monotone" dataKey="steps" stroke="var(--chart-steps, var(--accent))" strokeWidth={2} fill="#007bff" fillOpacity={0.1} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Daily Steps" />
                                  <Line type="monotone" dataKey="avg7Day" stroke="var(--chart-avg7, var(--bs-success))" strokeWidth={2} dot={false} strokeDasharray="5 5" name="7-Day Average (Current Trend)" />
                                  <Line type="monotone" dataKey="avg21Day" stroke="var(--chart-avg21, var(--bs-warning))" strokeWidth={2} dot={false} strokeDasharray="10 5" name="21-Day Average (Build a Habit)" />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="text-center py-5">
                              <p className="text-muted">No steps data available for the last 30 days</p>
                              <Link className="btn btn-primary" to="/download">
                                Set up data integration
                              </Link>
                            </div>
                          )}
                        </Card.Body>
                      </Card>
                    </Col>

                    {/* Steps Stats */}
                    <Col lg={4}>
                      <Card className="shadow-sm mb-3">
                        <Card.Body>
                          <h6 className="text-muted mb-2">Total Steps</h6>
                          <h3 className="mb-0">{stepsStats.total.toLocaleString()}</h3>
                          <small className="text-muted">Last 30 days</small>
                        </Card.Body>
                      </Card>
                      <Card className="shadow-sm mb-3">
                        <Card.Body>
                          <h6 className="text-muted mb-2">Daily Average</h6>
                          <h3 className="mb-0">{stepsStats.average.toLocaleString()}</h3>
                          <small className="text-muted">Steps per day</small>
                        </Card.Body>
                      </Card>
                      <Card className="shadow-sm">
                        <Card.Body>
                          <h6 className="text-muted mb-2">Best Day</h6>
                          <h3 className="mb-0">{stepsStats.bestDay ? stepsStats.bestDay.steps.toLocaleString() : "—"}</h3>
                          <small className="text-muted">{stepsStats.bestDay ? stepsStats.bestDay.label : "No data"}</small>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                </Carousel.Item>

                {/* Heart Rate Zones Chart Slide */}
                <Carousel.Item>
                  <Row className="g-4">
                    <Col lg={8}>
                      <Card className="shadow-sm">
                        <Card.Header>
                          <h5 className="mb-0">Heart Rate Zones Over Time</h5>
                          <small className="text-muted">
                            Personalized heart rate zones based on your profile - Last 7 days
                            {heartChartData.zoneThresholds && (
                              <span className="d-block mt-1 text-success fw-bold">
                                ✓ Max HR: {heartChartData.zoneThresholds.maxHR ?? 155} BPM • Resting HR: {avgRestingHeartRate} BPM (50% max HR)
                              </span>
                            )}
                          </small>
                        </Card.Header>
                        <Card.Body>
                          {heartChartData.length > 0 ? (
                            <div style={{ width: "100%", height: 400 }}>
                              <ResponsiveContainer>
                                <LineChart data={heartChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${value} bpm`} domain={[0, 180]} />
                                  {/* Reference areas (zones) */}
                                  {(() => {
                                    const zones = heartChartData.zoneThresholds || {};
                                    const restEnd = zones.restZoneEnd ?? 85;
                                    const lightEnd = zones.lightZoneEnd || Math.round((zones.maxHR || 155) * 0.65);
                                    const moderateEnd = zones.moderateZoneEnd || Math.round((zones.maxHR || 155) * 0.75);
                                    const hardEnd = zones.hardZoneEnd || Math.round((zones.maxHR || 155) * 0.95);
                                    const maxDanger = Math.max(hardEnd + 10, zones.maxHR || 180);
                                    return (
                                      <>
                                        <ReferenceArea y1={0} y2={restEnd} fill="var(--chart-zone-rest, var(--bs-info))" fillOpacity={0.12} label={`Rest (≤${restEnd} BPM)`} />
                                        <ReferenceArea y1={restEnd} y2={lightEnd} fill="var(--chart-zone-light, var(--bs-success))" fillOpacity={0.12} label={`Light (≤65% max)`} />
                                        <ReferenceArea y1={lightEnd} y2={moderateEnd} fill="var(--chart-zone-moderate, var(--bs-warning))" fillOpacity={0.12} label={`Moderate (65–75%)`} />
                                        <ReferenceArea y1={moderateEnd} y2={hardEnd} fill="var(--chart-zone-hard, var(--bs-danger))" fillOpacity={0.12} label={`Hard`} />
                                        <ReferenceArea y1={hardEnd} y2={maxDanger} fill="#6f42c1" fillOpacity={0.12} label=">95% (Danger)" />
                                      </>
                                    );
                                  })()}
                                  <Tooltip 
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        const zones = heartChartData.zoneThresholds || {};
                                        return (
                                          <div className="bg-white p-3 border rounded shadow-sm" style={{ minWidth: 240 }}>
                                            <div className="small">
                                              <div className="fw-bold mb-2">Date: {data.label}</div>
                                              {payload.map((entry, index) => {
                                                const zoneNames = { rest: "Rest Zone", light: "Light Activity", moderate: "Moderate Activity", hard: "Hard Activity" };
                                                const zoneName = zoneNames[entry.dataKey] || entry.dataKey;
                                                return (
                                                  <div key={index} className="mb-1">
                                                    <span style={{ color: entry.color, fontSize: '1.2em' }}>●</span> {zoneName}: <strong>{entry.value} bpm</strong>
                                                  </div>
                                                );
                                              })}
                                              {data.restingHR && data.restingHRMin !== data.restingHRMax && (
                                                <div className="mt-2 pt-2 border-top text-muted">
                                                  <div className="small fw-bold mb-1">Resting HR (This Day):</div>
                                                  <div>Range: <strong>{data.restingHRMin} - {data.restingHRMax} bpm</strong></div>
                                                  <div>Average: <strong>{data.restingHR} bpm</strong></div>
                                                </div>
                                              )}
                                              {data.restingHR && data.restingHRMin === data.restingHRMax && (
                                                <div className="mt-2 pt-2 border-top text-muted">
                                                  <div className="small">Resting HR (This Day): <strong>{data.restingHR} bpm</strong></div>
                                                </div>
                                              )}
                                              {zones.lightZoneStart && (
                                                <div className="mt-2 pt-2 border-top text-muted">
                                                  <div className="small fw-bold mb-1">Personalized Zones:</div>
                                                  <div className="small">Rest: &lt;{zones.lightZoneStart} BPM (50% max)</div>
                                                  <div className="small">Light: {zones.lightZoneStart}-{zones.lightZoneEnd} BPM (65% max)</div>
                                                  <div className="small">Moderate: {zones.lightZoneEnd}-{zones.moderateZoneEnd} BPM (75% max)</div>
                                                  <div className="small">Hard: {zones.moderateZoneEnd}-{zones.hardZoneEnd} BPM (95% max)</div>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <Legend />
                                  <Line type="monotone" dataKey="rest" stroke="var(--chart-hr-rest, var(--bs-info))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Rest Zone" connectNulls={false} />
                                  <Line type="monotone" dataKey="light" stroke="var(--chart-hr-light, var(--bs-success))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Light Activity" connectNulls={false} />
                                  <Line type="monotone" dataKey="moderate" stroke="var(--chart-hr-moderate, var(--bs-warning))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Moderate Activity" connectNulls={false} />
                                  <Line type="monotone" dataKey="hard" stroke="var(--chart-hr-hard, var(--bs-danger))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Hard" connectNulls={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="text-center py-5">
                              <p className="text-muted">No heart rate data available for the last 30 days</p>
                              <Link className="btn btn-primary" to="/download">
                                Set up data integration
                              </Link>
                            </div>
                          )}
                        </Card.Body>
                      </Card>
                    </Col>

                    {/* Heart Rate Zone Statistics */}
                    <Col lg={4}>
                      <Card className="shadow-sm">
                        <Card.Body>
                          <h6 className="text-muted mb-2">Zone Statistics</h6>
                          {/* Resting Heart Rate */}
                          <div className="mb-3">
                            <div className="d-flex align-items-center mb-2">
                              <div className="me-2" style={{ width: 12, height: 12, backgroundColor: 'var(--chart-zone-rest, var(--bs-info))', borderRadius: '2px' }}></div>
                              <small className="text-muted fw-bold">
                                {restingHeartRateData.length > 0 ? `Resting Heart Rate (< 78 BPM)` : `Rest Zone (< 78 BPM) • 50% Max`}
                              </small>
                            </div>
                            {restingHeartRateData.length > 0 ? (
                              <>
                                {(() => {
                                  const allMinValues = heartChartData.map(d => d.restingHRMin).filter(v => v > 0 && v !== 75);
                                  const allMaxValues = heartChartData.map(d => d.restingHRMax).filter(v => v > 0 && v !== 75);
                                  if (allMinValues.length > 0 && allMaxValues.length > 0) {
                                    const overallMin = Math.min(...allMinValues);
                                    const overallMax = Math.max(...allMaxValues);
                                    return (
                                      <>
                                        <div className="d-flex justify-content-between mb-1">
                                          <span className="text-info">Lowest:</span>
                                          <span>{overallMin} bpm</span>
                                        </div>
                                        <div className="d-flex justify-content-between mb-1">
                                          <span className="text-danger">Highest:</span>
                                          <span>{overallMax} bpm</span>
                                        </div>
                                        <div className="d-flex justify-content-between mb-1">
                                          <span className="text-primary">Average:</span>
                                          <span className="fw-bold">{avgRestingHeartRate} bpm</span>
                                        </div>
                                      </>
                                    );
                                  }
                                  return (
                                    <div className="d-flex justify-content-between">
                                      <span className="text-primary">Average:</span>
                                      <span className="fw-bold">{avgRestingHeartRate} bpm</span>
                                    </div>
                                  );
                                })()}
                                <div className="small text-muted mt-1 fst-italic">
                                  From {restingHeartRateData.length} measurement{restingHeartRateData.length !== 1 ? 's' : ''}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="d-flex justify-content-between mb-1">
                                  <span className="text-danger">Highest:</span>
                                  <span>{heartZoneStats.rest.max} bpm</span>
                                </div>
                                <div className="d-flex justify-content-between mb-1">
                                  <span className="text-info">Lowest:</span>
                                  <span>{heartZoneStats.rest.min} bpm</span>
                                </div>
                                <div className="d-flex justify-content-between">
                                  <span className="text-primary">Average:</span>
                                  <span>{heartZoneStats.rest.average} bpm</span>
                                </div>
                                <div className="small text-muted mt-1 fst-italic">
                                  No resting HR data - showing &lt;78 BPM zone (50% max HR)
                                </div>
                              </>
                            )}
                          </div>
                          {/* Light Activity Zone */}
                          <div className="mb-3">
                            <div className="d-flex align-items-center mb-2">
                              <div className="me-2" style={{ width: 12, height: 12, backgroundColor: 'var(--chart-zone-light, var(--bs-success))', borderRadius: '2px' }}></div>
                              <small className="text-muted fw-bold">
                                Light Activity ({heartChartData.zoneThresholds?.lightZoneStart || highestRestingHeartRate}-{heartChartData.zoneThresholds?.lightZoneEnd || 105} BPM) • 65% Max
                              </small>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-danger">Highest:</span>
                              <span>{heartZoneStats.light.max} bpm</span>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-info">Lowest:</span>
                              <span>{heartZoneStats.light.min} bpm</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span className="text-primary">Average:</span>
                              <span>{heartZoneStats.light.average} bpm</span>
                            </div>
                          </div>
                          {/* Moderate Activity Zone */}
                          <div className="mb-3">
                            <div className="d-flex align-items-center mb-2">
                              <div className="me-2" style={{ width: 12, height: 12, backgroundColor: 'var(--chart-zone-moderate, var(--bs-warning))', borderRadius: '2px' }}></div>
                              <small className="text-muted fw-bold">
                                Moderate Activity ({heartChartData.zoneThresholds?.lightZoneEnd || 105}-{heartChartData.zoneThresholds?.moderateZoneEnd || 135} BPM) • 75% Max
                              </small>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-danger">Highest:</span>
                              <span>{heartZoneStats.moderate.max} bpm</span>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-info">Lowest:</span>
                              <span>{heartZoneStats.moderate.min} bpm</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span className="text-primary">Average:</span>
                              <span>{heartZoneStats.moderate.average} bpm</span>
                            </div>
                          </div>
                          {/* Hard Activity Zone */}
                          <div>
                            <div className="d-flex align-items-center mb-2">
                              <div className="me-2" style={{ width: 12, height: 12, backgroundColor: 'var(--chart-zone-hard, var(--bs-danger))', borderRadius: '2px' }}></div>
                              <small className="text-muted fw-bold">
                                Hard Activity ({heartChartData.zoneThresholds?.moderateZoneEnd || 135}-{heartChartData.zoneThresholds?.hardZoneEnd || 175} BPM) • 95% Max
                              </small>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-danger">Highest:</span>
                              <span>{heartZoneStats.hard.max} bpm</span>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-info">Lowest:</span>
                              <span>{heartZoneStats.hard.min} bpm</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span className="text-primary">Average:</span>
                              <span>{heartZoneStats.hard.average} bpm</span>
                            </div>
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>

                  {/* Heart Rate Insights */}
                  {(() => {
                    const zones = heartChartData.zoneThresholds || {};
                    const hardEnd = zones.hardZoneEnd || Math.round((zones.maxHR || 155) * 0.95);
                    const sevenDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; })();
                    const anyDangerLast7 = (heartData || []).some(h => {
                      const v = typeof h.value === 'number' ? h.value : Number(h.value);
                      const t = new Date(h.ts);
                      return Number.isFinite(v) && v > hardEnd && t >= sevenDaysAgo;
                    });
                    const avgRest = Math.min(avgRestingHeartRate, 999);
                    const insights = [];
                    if (avgRest < 60) {
                      insights.push({
                        status: 'warning',
                        icon: '🩺',
                        title: 'Low Resting Heart Rate',
                        text: 'Your average resting heart rate is low, which may indicate an underlying medical issue -> If you feel lightheaded, dizziness or chest discomfort, please see a doctor',
                      });
                    } else if (avgRest > 85) {
                      insights.push({
                        status: 'warning',
                        icon: '⚠️',
                        title: 'High Resting Heart Rate',
                        text: 'Your average resting heart rate is high, which may indicate an underlying health issue -> If you feel chest tightness, fatigue, irregular or erratic pulse, or shortness of breath, please see a doctor',
                      });
                    } else if (avgRest > 55 && avgRest < 85) {
                      insights.push({
                        status: 'info',
                        icon: '🚶‍♂️',
                        title: 'Cardio Guidance',
                        text: 'Aim for at least 150 minutes of moderate-intensity cardio per week, or at least 75 minutes of hard-intensity cardio per week -> Start with brisk walking for 10 minutes at a time, or try marching on the spot with high knees during tv ad breaks -> To gauge intensity, you should be able to talk while moving',
                      });
                    }
                    if (anyDangerLast7) {
                      insights.push({
                        status: 'danger',
                        icon: '⛔',
                        title: 'Very High Exercise Intensity',
                        text: 'Exercise intensity above 95% is generally not recommended for older adults (risk of cardiac overuse injuries and other cardiovascular problems)',
                      });
                    }
                    if (!insights.length) return null;
                    const expandedInsights = insights.flatMap((ins) => {
                      const parts = String(ins.text).split('->').map(p => p.trim()).filter(Boolean);
                      if (parts.length <= 1) return [ins];
                      return parts.map((part) => ({ status: ins.status, icon: ins.icon, title: ins.title, text: part }));
                    });
                    return (
                      <Row className="mt-4">
                        <Col>
                          <Card className="shadow-sm">
                            <Card.Header>
                              <h6 className="mb-0">
                                Heart Rate Insights
                                {avgRest < 60 && <span className="badge bg-warning ms-2">Low RHR</span>}
                                {avgRest > 85 && <span className="badge bg-warning ms-2">High RHR</span>}
                                {anyDangerLast7 && <span className="badge bg-danger ms-2">Danger &gt;95%</span>}
                              </h6>
                            </Card.Header>
                            <Card.Body>
                              <Row className="g-3">
                                {expandedInsights.map((ins, idx) => (
                                  <Col md={expandedInsights.length <= 2 ? 6 : 4} key={idx}>
                                    <Card className={`h-100 border-0 ${
                                      ins.status === 'danger' ? 'bg-danger bg-opacity-10' :
                                      ins.status === 'warning' ? 'bg-warning bg-opacity-10' :
                                      'bg-info bg-opacity-10'
                                    }`}>
                                      <Card.Body className="p-3">
                                        <div className="d-flex align-items-start">
                                          <div className="me-2" style={{ fontSize: '1.5rem' }}>{ins.icon}</div>
                                          <div>
                                            <h6 className="mb-1">{ins.title}</h6>
                                            <small className="text-muted">{ins.text}</small>
                                          </div>
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>
                                ))}
                              </Row>
                            </Card.Body>
                          </Card>
                        </Col>
                      </Row>
                    );
                  })()}
                </Carousel.Item>

                {/* Sleep Duration Chart Slide */}
                <Carousel.Item>
                  <Row className="g-4">
                    <Col lg={8}>
                      <Card className="shadow-sm">
                        <Card.Header>
                          <div className="d-flex justify-content-between align-items-start">
                            <div>
                              <h5 className="mb-0">Sleep Stages Over Time</h5>
                              <small className="text-muted">Sleep stage breakdown in hours per day (excluding "In bed") - Last 30 days</small>
                            </div>
                            <Button 
                              variant="outline-primary" 
                              size="sm"
                              onClick={() => setShowHypnogramPopup(true)}
                              disabled={sleepChartData.length === 0}
                            >
                              Comprehensive Breakdown
                            </Button>
                          </div>
                        </Card.Header>
                        <Card.Body>
                          {sleepChartData.length > 0 ? (
                            <div style={{ width: "100%", height: 300 }}>
                              <ResponsiveContainer>
                                <BarChart data={sleepChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `${typeof value === 'number' ? value.toFixed(1) : value}h`} domain={[0, 'dataMax + 0.5']} />
                                  <Tooltip formatter={(value, name) => [`${typeof value === 'number' ? value.toFixed(1) : value}h`, name]} labelFormatter={(label) => `Date: ${label}`} />
                                  <Legend />
                                  <Bar dataKey="REM" stackId="sleep" fill="var(--chart-sleep-rem, var(--bs-info))" name="REM" radius={[0, 0, 0, 0]} />
                                  <Bar dataKey="Core" stackId="sleep" fill="var(--chart-sleep-core, var(--accent))" radius={[0, 0, 0, 0]} />
                                  <Bar dataKey="Deep" stackId="sleep" fill="var(--chart-sleep-deep, var(--accent-4, #a78bfa))" radius={[0, 0, 0, 0]} />
                                  <Bar dataKey="Awake" stackId="sleep" fill="var(--chart-sleep-awake, var(--bs-warning))" name="Awake" radius={[0, 0, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="text-center py-5">
                              <p className="text-muted">No sleep data available for the last 30 days</p>
                              <p className="text-muted small">(Excludes "In bed" time - shows actual sleep stages only)</p>
                              <Link className="btn btn-primary" to="/download">
                                Set up data integration
                              </Link>
                            </div>
                          )}
                        </Card.Body>
                      </Card>
                    </Col>

                    {/* Sleep Stats */}
                    <Col lg={4}>
                      <Card className="shadow-sm mb-3">
                        <Card.Body>
                          <h6 className="text-muted mb-2">Total Sleep</h6>
                          <h3 className="mb-0">{sleepStats.total.toFixed(1)}h</h3>
                          <small className="text-muted">Last 30 days (excluding "In bed")</small>
                        </Card.Body>
                      </Card>
                      <Card className="shadow-sm mb-3">
                        <Card.Body>
                          <h6 className="text-muted mb-2">Average Sleep</h6>
                          <h3 className="mb-0">{sleepStats.average.toFixed(1)}h</h3>
                          <small className="text-muted">Per night</small>
                        </Card.Body>
                      </Card>
                      <Card className="shadow-sm mb-3">
                        <Card.Body>
                          <h6 className="text-muted mb-2">Stage Averages</h6>
                          <div className="mb-2">
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-primary">REM:</span>
                              <span>{sleepStats.stageAverages.REM.toFixed(1)}h ({sleepStats.stagePercentages.REM}%)</span>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-info">Core:</span>
                              <span>{sleepStats.stageAverages.Core.toFixed(1)}h ({sleepStats.stagePercentages.Core}%)</span>
                            </div>
                            <div className="d-flex justify-content-between mb-1">
                              <span className="text-purple">Deep:</span>
                              <span>{sleepStats.stageAverages.Deep.toFixed(1)}h ({sleepStats.stagePercentages.Deep}%)</span>
                            </div>
                            <div className="d-flex justify-content-between">
                              <span className="text-warning">Awake:</span>
                              <span>{sleepStats.stageAverages.Awake.toFixed(1)}h ({sleepStats.stagePercentages.Awake}%)</span>
                            </div>
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>

                  {/* Sleep Insights */}
                  {(() => {
                    const si = sleepStats.sleepInsights || {};
                    const insights = [];
                    if (si.showSleepDurationInsight) {
                      insights.push({ status: 'warning', icon: '⏰', title: 'Sleep Duration', text: 'Sleep duration is ideally between 7 and 9 hours for optimal health and cognitive function.' });
                    }
                    if (si.showDeepSleepInsight) {
                      insights.push({ status: 'warning', icon: '🧠', title: 'Deep Sleep (13-23%)', text: 'Deep sleep is crucial for tissue and bone repair, immune function, and cognitive health. Low deep sleep % is linked to higher risk of cognitive decline.' });
                    }
                    if (si.showREMSleepInsight) {
                      insights.push({ status: 'info', icon: '💭', title: 'REM Sleep (20-25%)', text: 'REM sleep is vital for memory processing and emotional regulation in older adults.' });
                    }
                    if (si.showGeneralTips) {
                      insights.push({ status: 'success', icon: '🌙', title: 'Better Sleep Tips', text: 'Establish consistency with bedtime and wake time, create a bedtime routine, and moderate caffeine/alcohol intake.' });
                    }
                    if (!insights.length) return null;
                    return (
                      <Row className="mt-4">
                        <Col>
                          <Card className="shadow-sm">
                            <Card.Header>
                              <h6 className="mb-0">
                                Sleep Insights
                                {si.showSleepDurationInsight && <span className="badge bg-warning ms-2">Duration</span>}
                                {si.showDeepSleepInsight && <span className="badge bg-warning ms-2">Deep Sleep</span>}
                                {si.showREMSleepInsight && <span className="badge bg-info ms-2">REM Sleep</span>}
                                {si.showGeneralTips && <span className="badge bg-success ms-2">Tips</span>}
                              </h6>
                            </Card.Header>
                            <Card.Body>
                              <Row className="g-3">
                                {insights.map((ins, idx) => (
                                  <Col md={insights.length <= 2 ? 6 : 4} key={idx}>
                                    <Card className={`h-100 border-0 ${
                                      ins.status === 'warning' ? 'bg-warning bg-opacity-10' :
                                      ins.status === 'info' ? 'bg-info bg-opacity-10' :
                                      ins.status === 'primary' ? 'bg-primary bg-opacity-10' :
                                      'bg-success bg-opacity-10'
                                    }`}>
                                      <Card.Body className="p-3">
                                        <div className="d-flex align-items-start">
                                          <div className="me-2" style={{ fontSize: '1.5rem' }}>{ins.icon}</div>
                                          <div>
                                            <h6 className="mb-1">{ins.title}</h6>
                                            <small className="text-muted">{ins.text}</small>
                                          </div>
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>
                                ))}
                              </Row>
                            </Card.Body>
                          </Card>
                        </Col>
                      </Row>
                    );
                  })()}

                  {/* Sleep Optimization Tips Card */}
                  <Row className="mt-4">
                    <Col>
                      <Card className="shadow-sm">
                        <Card.Header>
                          <h6 className="mb-0">Sleep Optimization Tips</h6>
                        </Card.Header>
                        <Card.Body>
                          <div className="d-flex align-items-start">
                            <div className="me-3 fs-4">💤</div>
                            <div>
                              <p className="text-muted mb-0">
                                Maintain a cool, dark bedroom environment. Avoid screens ideally 1 hour before bedtime. 
                                Try to limit caffeine intake after 2pm. Exercise regularly but not too close to bedtime.
                              </p>
                            </div>
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                </Carousel.Item>

                {/* Activity Rings Chart Slide */}
                <Carousel.Item>
                  <Row className="g-4">
                    <Col lg={12}>
                      <Card className="shadow-sm">
                        <Card.Header>
                          <h5 className="mb-0">Daily Activity Rings</h5>
                          <small className="text-muted">Last 7 days - Apple Watch style activity rings</small>
                        </Card.Header>
                        <Card.Body>
                          {activityRingsData.length > 0 && 
                           (activityRingsData.some(d => d.standHours > 0) || 
                            activityRingsData.some(d => d.hrv > 0) || 
                            activityRingsData.some(d => d.totalEnergy > 0)) ? (
                            <div>
                              {/* Horizontal scroll of 7 days */}
                              <div className="d-flex justify-content-start align-items-start gap-4 pb-3" style={{ overflowX: 'auto', overflowY: 'visible' }}>
                                {activityRingsData.map((dayData, idx) => (
                                  <div key={idx} className="text-center flex-shrink-0 activity-rings-day">
                                    <div className="mb-2">
                                      <ActivityRings
                                        key={`rings-${dayData.date}-${dayData.standHours}-${dayData.hrv}-${dayData.totalEnergy}`}
                                        standMinutes={dayData.standHours}
                                        standGoal={12}
                                        hrv={dayData.hrv}
                                        hrvPercent={calculateHRVPercent(dayData.hrv, hrvRange)}
                                        hrvRange={hrvRange}
                                        totalEnergy={dayData.totalEnergy}
                                        totalEnergyGoal={10000}
                                        size={180}
                                      />
                                    </div>
                                    <div className="small text-muted fw-bold">{dayData.label}</div>
                                    <div className="mt-2">
                                      <ActivityRingsLegend
                                        standMinutes={dayData.standHours}
                                        standGoal={12}
                                        hrv={dayData.hrv}
                                        hrvRange={hrvRange}
                                        totalEnergy={dayData.totalEnergy}
                                        totalEnergyGoal={10000}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              
                              {/* Summary Stats */}
                              <div className="mt-4 pt-3 border-top">
                                <h6 className="mb-3">7-Day Summary</h6>
                                <Row className="g-3">
                                  <Col md={4}>
                                    <Card className="bg-primary bg-opacity-10 border-primary">
                                      <Card.Body>
                                        <div className="d-flex align-items-center mb-2">
                                          <div style={{ width: 16, height: 16, backgroundColor: 'var(--ring-stand, var(--bs-info))', borderRadius: '50%', marginRight: 8 }} />
                                          <h6 className="mb-0">Stand Hours</h6>
                                        </div>
                                        <div className="d-flex justify-content-between mb-1">
                                          <span className="text-muted small">Daily Stand Hours:</span>
                                          <span className="fw-bold">
                                            {Math.round((activityRingsData.reduce((sum, d) => sum + d.standHours, 0) / 7) * 10) / 10} / 12 hr
                                            {standAnalysis.status === 'good' && <span className="text-success ms-1">✓</span>}
                                            {standAnalysis.status === 'partial' && <span className="text-info ms-1">~</span>}
                                            {standAnalysis.status === 'below' && <span className="text-warning ms-1">↓</span>}
                                          </span>
                                        </div>
                                        <div className="d-flex justify-content-between mb-1">
                                          <span className="text-muted small">Avg Total/Day:</span>
                                          <span className="fw-bold">{Math.round(standAnalysis.avgTotalMinutes)} min</span>
                                        </div>
                                        <div className="d-flex justify-content-between">
                                          <span className="text-muted small">Avg Min/Hour:</span>
                                          <span className="fw-bold">{Math.round(standAnalysis.avgMinutesPerHour * 10) / 10} min</span>
                                        </div>
                                        <div className="mt-2 pt-2 border-top">
                                          <small className="text-muted d-block">Target: 120+ min/day, 10+ min/hour</small>
                                          <small className="text-muted fst-italic">(12 hourly intervals = 12 hr)</small>
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>
                                  <Col md={4}>
                                    <Card className="bg-danger bg-opacity-10 border-danger">
                                      <Card.Body>
                                        <div className="d-flex align-items-center mb-2">
                                          <div style={{ width: 16, height: 16, backgroundColor: 'var(--ring-hrv, var(--bs-danger))', borderRadius: '50%', marginRight: 8 }} />
                                          <h6 className="mb-0">Heart Rate Variability</h6>
                                        </div>
                                        <div className="d-flex justify-content-between mb-1">
                                          <span className="text-muted small">7-Day Average:</span>
                                          <span className="fw-bold">
                                            {Math.round(hrvAnalysis.average)} ms
                                            {hrvAnalysis.status === 'above' && <span className="text-success ms-1">↑</span>}
                                            {hrvAnalysis.status === 'normal' && <span className="text-success ms-1">✓</span>}
                                            {hrvAnalysis.status === 'below' && <span className="text-warning ms-1">↓</span>}
                                          </span>
                                        </div>
                                        <div className="d-flex justify-content-between">
                                          <span className="text-muted small">Highest:</span>
                                          <span className="fw-bold">{Math.round(Math.max(...activityRingsData.map(d => d.hrv)))} ms</span>
                                        </div>
                                        <div className="mt-2 pt-2 border-top">
                                          <small className="text-muted d-block">Normal range: 40-60 ms</small>
                                          <small className="text-muted fst-italic">(Older adult range)</small>
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>
                                  <Col md={4}>
                                    <Card className="bg-success bg-opacity-10 border-success">
                                      <Card.Body>
                                        <div className="d-flex align-items-center mb-2">
                                          <div style={{ width: 16, height: 16, backgroundColor: 'var(--ring-energy, var(--bs-success))', borderRadius: '50%', marginRight: 8 }} />
                                          <h6 className="mb-0">Total Energy Expenditure</h6>
                                        </div>
                                        <div className="d-flex justify-content-between mb-1">
                                          <span className="text-muted small">7-Day Average:</span>
                                          <span className="fw-bold">
                                            {Math.round(energyAnalysis.average)} kJ
                                            {energyAnalysis.status === 'above' && <span className="text-warning ms-1">↑</span>}
                                            {energyAnalysis.status === 'normal' && <span className="text-success ms-1">✓</span>}
                                            {energyAnalysis.status === 'below' && <span className="text-warning ms-1">↓</span>}
                                          </span>
                                        </div>
                                        <div className="d-flex justify-content-between">
                                          <span className="text-muted small">Total (7 days):</span>
                                          <span className="fw-bold">{Math.round(activityRingsData.reduce((sum, d) => sum + d.totalEnergy, 0))} kJ</span>
                                        </div>
                                        <div className="mt-2 pt-2 border-top">
                                          <small className="text-muted d-block">
                                            {energyAnalysis.range 
                                              ? `Typical Range: ${energyAnalysis.range[0].toLocaleString()}-${energyAnalysis.range[1].toLocaleString()} kJ`
                                              : 'Active + Resting Energy'}
                                          </small>
                                          {energyAnalysis.range && (
                                            <small className="text-muted fst-italic">
                                              {userAge && userProfile?.gender ? `(${userProfile.gender}, Age ${userAge})` : ''}
                                            </small>
                                          )}
                                        </div>
                                      </Card.Body>
                                    </Card>
                                  </Col>
                                </Row>
                              </div>

                              {/* Standing Insights */}
                              {standAnalysis.insights.length > 0 && (
                                <div className="mt-4 pt-3 border-top">
                                  <h6 className="mb-3">
                                    Standing Activity Insights 
                                    {standAnalysis.status === 'good' && <span className="badge bg-success ms-2">Excellent</span>}
                                    {standAnalysis.status === 'partial' && <span className="badge bg-info ms-2">Making Progress</span>}
                                    {standAnalysis.status === 'below' && <span className="badge bg-warning ms-2">Needs Improvement</span>}
                                  </h6>
                                  <Row className="g-3">
                                    {standAnalysis.insights.map((insight, idx) => (
                                      <Col md={standAnalysis.insights.length === 2 ? 6 : 12} key={idx}>
                                        <Card className={`h-100 border-0 ${
                                          standAnalysis.status === 'good' ? 'bg-success bg-opacity-10' :
                                          standAnalysis.status === 'partial' ? 'bg-info bg-opacity-10' :
                                          'bg-warning bg-opacity-10'
                                        }`}>
                                          <Card.Body className="p-3">
                                            <div className="d-flex align-items-start">
                                              <div className="me-2" style={{ fontSize: '1.5rem' }}>{insight.icon}</div>
                                              <div>
                                                <h6 className="mb-1">{insight.title}</h6>
                                                <small className="text-muted">{insight.text}</small>
                                              </div>
                                            </div>
                                          </Card.Body>
                                        </Card>
                                      </Col>
                                    ))}
                                  </Row>
                                </div>
                              )}

                              {/* HRV Insights */}
                              {hrvAnalysis.insights.length > 0 && (
                                <div className="mt-4 pt-3 border-top">
                                  <h6 className="mb-3">
                                    HRV Insights 
                                    {hrvAnalysis.status === 'above' && <span className="badge bg-success ms-2">Excellent</span>}
                                    {hrvAnalysis.status === 'normal' && <span className="badge bg-primary ms-2">Normal</span>}
                                    {hrvAnalysis.status === 'below' && <span className="badge bg-warning ms-2">Needs Attention</span>}
                                  </h6>
                                  <Row className="g-3">
                                    {hrvAnalysis.insights.map((insight, idx) => (
                                      <Col md={hrvAnalysis.insights.length === 2 ? 6 : 12} key={idx}>
                                        <Card className={`h-100 border-0 ${
                                          hrvAnalysis.status === 'above' ? 'bg-success bg-opacity-10' :
                                          hrvAnalysis.status === 'normal' ? 'bg-primary bg-opacity-10' :
                                          'bg-warning bg-opacity-10'
                                        }`}>
                                          <Card.Body className="p-3">
                                            <div className="d-flex align-items-start">
                                              <div className="me-2" style={{ fontSize: '1.5rem' }}>{insight.icon}</div>
                                              <div>
                                                <h6 className="mb-1">{insight.title}</h6>
                                                <small className="text-muted">{insight.text}</small>
                                              </div>
                                            </div>
                                          </Card.Body>
                                        </Card>
                                      </Col>
                                    ))}
                                  </Row>
                                </div>
                              )}

                              {/* Energy Expenditure Insights */}
                              {energyAnalysis.insights.length > 0 && energyAnalysis.range && (
                                <div className="mt-4 pt-3 border-top">
                                  <h6 className="mb-3">
                                    Energy Expenditure Insights 
                                    {energyAnalysis.status === 'above' && <span className="badge bg-warning ms-2">Above Average</span>}
                                    {energyAnalysis.status === 'normal' && <span className="badge bg-success ms-2">Balanced</span>}
                                    {energyAnalysis.status === 'below' && <span className="badge bg-warning ms-2">Below Average</span>}
                                  </h6>
                                  <Row className="g-3">
                                    {energyAnalysis.insights.map((insight, idx) => (
                                      <Col md={energyAnalysis.insights.length === 2 ? 6 : 12} key={idx}>
                                        <Card className={`h-100 border-0 ${energyAnalysis.status === 'normal' ? 'bg-success bg-opacity-10' : 'bg-warning bg-opacity-10'}`}>
                                          <Card.Body className="p-3">
                                            <div className="d-flex align-items-start">
                                              <div className="me-2" style={{ fontSize: '1.5rem' }}>{insight.icon}</div>
                                              <div>
                                                <h6 className="mb-1">{insight.title}</h6>
                                                <small className="text-muted">{insight.text}</small>
                                              </div>
                                            </div>
                                          </Card.Body>
                                        </Card>
                                      </Col>
                                    ))}
                                  </Row>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-5">
                              <p className="text-muted">No activity data available for the last 7 days</p>
                              <p className="text-muted small">Upload health data including stand_minutes, heart_rate_variability, active_energy, and resting_energy</p>
                              <Link className="btn btn-primary" to="/download">
                                Set up data integration
                              </Link>
                            </div>
                          )}
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                </Carousel.Item>

                {/* Walking Gait Analysis Heatmap Slide */}
                <Carousel.Item>
                  <Row className="g-4">
                    <Col lg={12}>
                      <Card className="shadow-sm">
                        <Card.Header>
                          <h5 className="mb-0">Walking Gait Analysis - Hourly Heatmaps</h5>
                          <small className="text-muted">Last 7 days - Asymmetry, Speed, Double Support Time, and Step Length per hour</small>
                        </Card.Header>
                        <Card.Body>
                          <WalkingGaitHeatmap
                            walkingAsymmetryData={walkingAsymmetryData}
                            walkingSpeedData={walkingSpeedData}
                            doubleSupportTimeData={doubleSupportTimeData}
                            walkingStepLengthData={walkingStepLengthData}
                            stepsData={stepsData}
                            dateRange={7}
                          />
                        </Card.Body>
                      </Card>
                    </Col>
                  </Row>
                </Carousel.Item>
              </Carousel>
            </div>
          )}

          {/* Hypnogram Popup */}
          <HypnogramPopup
            show={showHypnogramPopup}
            onHide={() => setShowHypnogramPopup(false)}
            sleepData={sleepData}
            dateRange={7}
          />

          {/* Quick Actions */}
          <div className="mt-4">
            <h5 className="mb-3">Quick Actions</h5>
            <div className="d-flex flex-wrap gap-2">
              <Link className="btn btn-primary" to="/summary">View Detailed Analytics</Link>
              <Link className="btn btn-outline-primary" to="/download">Manage Integrations</Link>
              <Link className="btn btn-outline-primary" to="/automation-setup?name=Upload%20Health&time=12:00">Automation Setup</Link>
              <Link className="btn btn-outline-secondary" to="/admin">Admin Panel</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;

/** Format minutes into a readable string (e.g., "7h 30m" or "450m") */
function formatMinutes(minutes) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/** Canonicalize a sleep stage label and normalize edge cases. */
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
