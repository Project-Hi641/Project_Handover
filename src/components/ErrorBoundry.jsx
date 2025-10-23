import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props){ super(props); this.state = { hasError:false, error:null }; }
  static getDerivedStateFromError(error){ return { hasError:true, error }; }
  componentDidCatch(error, info){ console.error("Dashboard error:", error, info); }
  render(){
    if (this.state.hasError) {
      return (
        <div className="container py-4">
          <h4>Something went wrong</h4>
          <p className="text-muted">Please refresh the page. If it keeps happening, let us know.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
