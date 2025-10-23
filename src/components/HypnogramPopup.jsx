import React, { useEffect } from 'react';
import { Modal, Button, Row, Col } from 'react-bootstrap';
import HypnogramCarousel from './HypnogramCarousel';

/**
 * HypnogramPopup - Modal popup window for displaying daily hypnogram charts
 * Similar to Apple Watch sleep tracking interface
 */
export default function HypnogramPopup({ 
  show, 
  onHide, 
  sleepData = [], 
  dateRange = 7 
}) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (show) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [show]);

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      centered
      className="hypnogram-popup"
      backdrop="static"
      keyboard={false}
      fullscreen="md-down"
    >
      <Modal.Header className="hypnogram-popup-header">
        <div className="d-flex align-items-center justify-content-between w-100">
          <div className="d-flex align-items-center">
            <Button
              variant="link"
              onClick={onHide}
              className="p-0 me-3 text-decoration-none"
              style={{ color: '#007AFF' }}
            >
              ← Back
            </Button>
            <div>
              <h4 className="mb-0 fw-bold">Sleep Analysis</h4>
              <small className="text-muted">Daily Hypnogram Charts • 1-minute intervals • Core + REM + Awake + Deep</small>
            </div>
          </div>
          <Button
            variant="link"
            onClick={onHide}
            className="p-0 text-decoration-none"
            style={{ color: '#8E8E93' }}
          >
            ✕
          </Button>
        </div>
      </Modal.Header>
      
      <Modal.Body className="hypnogram-popup-body p-0">
        <div className="hypnogram-popup-content">
          <HypnogramCarousel
            sleepData={sleepData}
            dateRange={dateRange}
            onClose={onHide}
            isPopup={true}
          />
        </div>
      </Modal.Body>
    </Modal>
  );
}
