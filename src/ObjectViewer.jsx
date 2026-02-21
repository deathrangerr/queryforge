import { useState, useEffect } from 'react';
import './ObjectViewer.css';

export default function ObjectViewer({ 
  objectType, 
  objectName, 
  objectSchema,
  objectData,
  onClose,
  darkMode 
}) {
  const renderContent = () => {
    if (!objectData) {
      return <div className="empty-state">No data available</div>;
    }

    switch (objectType) {
      case 'function':
        return (
          <div className="object-details">
            <div className="detail-section">
              <h4>Function Details</h4>
              <table className="detail-table">
                <tbody>
                  <tr>
                    <td><strong>Name:</strong></td>
                    <td>{objectData.routine_name}</td>
                  </tr>
                  <tr>
                    <td><strong>Schema:</strong></td>
                    <td>{objectData.routine_schema}</td>
                  </tr>
                  <tr>
                    <td><strong>Type:</strong></td>
                    <td>{objectData.routine_type}</td>
                  </tr>
                  <tr>
                    <td><strong>Return Type:</strong></td>
                    <td>{objectData.return_type || 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {objectData.routine_definition && (
              <div className="detail-section">
                <h4>Source Code</h4>
                <pre className="code-block">{objectData.routine_definition}</pre>
              </div>
            )}
          </div>
        );

      case 'view':
        return (
          <div className="object-details">
            <div className="detail-section">
              <h4>View Details</h4>
              <table className="detail-table">
                <tbody>
                  <tr>
                    <td><strong>Name:</strong></td>
                    <td>{objectData.table_name}</td>
                  </tr>
                  <tr>
                    <td><strong>Schema:</strong></td>
                    <td>{objectData.table_schema}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {objectData.view_definition && (
              <div className="detail-section">
                <h4>View Definition</h4>
                <pre className="code-block">{objectData.view_definition}</pre>
              </div>
            )}
          </div>
        );

      case 'index':
        return (
          <div className="object-details">
            <div className="detail-section">
              <h4>Index Details</h4>
              <table className="detail-table">
                <tbody>
                  <tr>
                    <td><strong>Name:</strong></td>
                    <td>{objectData.indexname}</td>
                  </tr>
                  <tr>
                    <td><strong>Table:</strong></td>
                    <td>{objectData.tablename}</td>
                  </tr>
                  <tr>
                    <td><strong>Schema:</strong></td>
                    <td>{objectData.schemaname}</td>
                  </tr>
                  {objectData.index_type && (
                    <tr>
                      <td><strong>Type:</strong></td>
                      <td>{objectData.index_type}</td>
                    </tr>
                  )}
                  {objectData.uniqueness && (
                    <tr>
                      <td><strong>Unique:</strong></td>
                      <td>{objectData.uniqueness}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {objectData.indexdef && (
              <div className="detail-section">
                <h4>Index Definition</h4>
                <pre className="code-block">{objectData.indexdef}</pre>
              </div>
            )}
          </div>
        );

      case 'sequence':
        return (
          <div className="object-details">
            <div className="detail-section">
              <h4>Sequence Details</h4>
              <table className="detail-table">
                <tbody>
                  <tr>
                    <td><strong>Name:</strong></td>
                    <td>{objectData.sequence_name}</td>
                  </tr>
                  <tr>
                    <td><strong>Schema:</strong></td>
                    <td>{objectData.sequence_schema}</td>
                  </tr>
                  {objectData.data_type && (
                    <tr>
                      <td><strong>Data Type:</strong></td>
                      <td>{objectData.data_type}</td>
                    </tr>
                  )}
                  {objectData.start_value && (
                    <tr>
                      <td><strong>Start Value:</strong></td>
                      <td>{objectData.start_value}</td>
                    </tr>
                  )}
                  {objectData.increment && (
                    <tr>
                      <td><strong>Increment:</strong></td>
                      <td>{objectData.increment}</td>
                    </tr>
                  )}
                  {objectData.min_value && (
                    <tr>
                      <td><strong>Min Value:</strong></td>
                      <td>{objectData.min_value}</td>
                    </tr>
                  )}
                  {objectData.max_value && (
                    <tr>
                      <td><strong>Max Value:</strong></td>
                      <td>{objectData.max_value}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'trigger':
        return (
          <div className="object-details">
            <div className="detail-section">
              <h4>Trigger Details</h4>
              <table className="detail-table">
                <tbody>
                  <tr>
                    <td><strong>Name:</strong></td>
                    <td>{objectData.trigger_name}</td>
                  </tr>
                  <tr>
                    <td><strong>Table:</strong></td>
                    <td>{objectData.table_name}</td>
                  </tr>
                  <tr>
                    <td><strong>Schema:</strong></td>
                    <td>{objectData.trigger_schema}</td>
                  </tr>
                  {objectData.event_manipulation && (
                    <tr>
                      <td><strong>Event:</strong></td>
                      <td>{objectData.event_manipulation}</td>
                    </tr>
                  )}
                  {objectData.action_timing && (
                    <tr>
                      <td><strong>Timing:</strong></td>
                      <td>{objectData.action_timing}</td>
                    </tr>
                  )}
                  {objectData.triggering_event && (
                    <tr>
                      <td><strong>Event:</strong></td>
                      <td>{objectData.triggering_event}</td>
                    </tr>
                  )}
                  {objectData.trigger_type && (
                    <tr>
                      <td><strong>Type:</strong></td>
                      <td>{objectData.trigger_type}</td>
                    </tr>
                  )}
                  {objectData.status && (
                    <tr>
                      <td><strong>Status:</strong></td>
                      <td>{objectData.status}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      default:
        return <div className="empty-state">Unknown object type</div>;
    }
  };

  return (
    <div className="object-viewer-overlay" onClick={onClose}>
      <div className="object-viewer-dialog" onClick={e => e.stopPropagation()}>
        <div className="object-viewer-header">
          <h3>
            {objectType === 'function' && '⚡'}
            {objectType === 'view' && '👁️'}
            {objectType === 'index' && '🔍'}
            {objectType === 'sequence' && '🔢'}
            {objectType === 'trigger' && '⚙️'}
            {' '}
            {objectName}
          </h3>
          <button onClick={onClose} className="btn-close">✕</button>
        </div>
        <div className="object-viewer-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
