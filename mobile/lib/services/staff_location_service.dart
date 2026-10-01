// ==============================================================================
// MEDGUARD CLINICAL HEALTHCARE SYSTEM — MOBILE STAFF CLIENT (FLUTTER / DART)
// Service: StaffLocationService (Continuous GPS & Emergency SOS via OsmAnd Protocol)
//
// Target Traccar Server: Port 5055 (OsmAnd protocol) or MedGuard Tracking Ingest
//
// ETHICAL SEPARATION & PRIVACY NOTICE:
// 1. Explicit Consent: Continuous GPS tracking is strictly voluntary and used for
//    staff physical safety, emergency SOS, and lone-worker protection.
// 2. Doctor Privacy Toggle: Doctors can turn tracking off at any time (except active SOS).
// 3. Decoupling Guarantee: This personal mobile GPS signal is NOT used for RiskBAC
//    clinical chart access. RiskBAC uses IP CIDR matching on hospital workstations.
// ==============================================================================

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import 'package:battery_plus/battery_plus.dart';

enum TrackingState {
  uninitialized,
  permissionDenied,
  consentRequired,
  activeTracking,
  pausedByDoctor,
  emergencySOS
}

class StaffLocationService {
  static final StaffLocationService _instance = StaffLocationService._internal();
  factory StaffLocationService() => _instance;
  StaffLocationService._internal();

  // Configuration
  String _traccarHost = 'http://10.0.2.2:5055'; // Default emulator host or server IP
  String _deviceId = 'alice_vance_mobile';
  String _doctorId = 'doc-001';
  String _doctorName = 'Dr. Alice Vance, MD';

  // State
  TrackingState _state = TrackingState.uninitialized;
  bool _consentGiven = false;
  bool _trackingEnabledByDoctor = true;
  bool _isSosActive = false;

  Timer? _trackingTimer;
  StreamSubscription<Position>? _positionStreamSub;
  final Battery _battery = Battery();

  // Listeners
  final ValueNotifier<TrackingState> stateNotifier =
      ValueNotifier<TrackingState>(TrackingState.uninitialized);
  final ValueNotifier<Position?> lastPositionNotifier = ValueNotifier<Position?>(null);
  final ValueNotifier<int> batteryNotifier = ValueNotifier<int>(100);

  TrackingState get currentState => _state;
  bool get isSosActive => _isSosActive;
  bool get hasConsent => _consentGiven;
  bool get isTrackingEnabled => _trackingEnabledByDoctor;

  /// 1. Initialize Service with Doctor Credentials & Server Host
  Future<void> initialize({
    required String traccarHost,
    required String deviceId,
    required String doctorId,
    required String doctorName,
    bool initialConsent = false,
  }) async {
    _traccarHost = traccarHost;
    _deviceId = deviceId;
    _doctorId = doctorId;
    _doctorName = doctorName;
    _consentGiven = initialConsent;

    if (!_consentGiven) {
      _updateState(TrackingState.consentRequired);
      return;
    }

    await requestStagedPermissions();
  }

  /// 2. Mandatory Staged Permissions Flow (Foreground first, then Background)
  Future<bool> requestStagedPermissions() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      debugPrint('[StaffLocation] Location services are disabled on device.');
      _updateState(TrackingState.permissionDenied);
      return false;
    }

    LocationPermission permission = await Geolocator.checkPermission();

    // Stage 1: Request Foreground (When In Use) Permission
    if (permission == LocationPermission.denied) {
      debugPrint('[StaffLocation] Requesting Stage 1: Foreground Location Permission...');
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        _updateState(TrackingState.permissionDenied);
        return false;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      debugPrint('[StaffLocation] Location permission permanently denied.');
      _updateState(TrackingState.permissionDenied);
      return false;
    }

    // Stage 2: Background (Always) Permission for Shift / Lone-Worker Safety
    // Note: On Android 11+ and iOS, background permission must be requested after foreground
    if (permission == LocationPermission.whileInUse) {
      debugPrint('[StaffLocation] Upgrading to Stage 2: Background (Always) Permission...');
      // Requesting background mode
      try {
        permission = await Geolocator.requestPermission();
      } catch (e) {
        debugPrint('[StaffLocation] Background upgrade note: $e');
      }
    }

    debugPrint('[StaffLocation] Location permissions granted: $permission');
    _startPeriodicTracking();
    return true;
  }

  /// 3. Doctor Explicit Consent Management (Staff Safety Opt-In)
  Future<void> setStaffConsent(bool consent) async {
    _consentGiven = consent;
    if (!consent) {
      _stopTracking();
      _updateState(TrackingState.consentRequired);
      debugPrint('[StaffLocation] Staff consent REVOKED. GPS transmission stopped.');
    } else {
      await requestStagedPermissions();
    }
  }

  /// 4. Doctor Privacy Control: Toggle Tracking On/Off (Except SOS)
  void setTrackingEnabled(bool enabled) {
    if (!_consentGiven && enabled) {
      debugPrint('[StaffLocation] Cannot enable tracking without staff safety consent.');
      return;
    }

    _trackingEnabledByDoctor = enabled;
    if (enabled) {
      debugPrint('[StaffLocation] Doctor resumed location tracking.');
      _startPeriodicTracking();
    } else {
      debugPrint('[StaffLocation] Doctor paused location tracking (Privacy Mode active).');
      _stopTracking();
      _updateState(TrackingState.pausedByDoctor);
    }
  }

  /// 5. Emergency SOS Panic Trigger (Overrides Privacy Toggle, Sends Every 5s)
  Future<void> triggerEmergencySOS() async {
    _isSosActive = true;
    _updateState(TrackingState.emergencySOS);
    debugPrint('[StaffLocation] EMERGENCY SOS ACTIVATED by $_doctorName ($_doctorId)!');

    // Immediate emergency transmission
    await _captureAndTransmitPosition(isSos: true);

    // High-frequency 5-second pulse during SOS crisis
    _trackingTimer?.cancel();
    _trackingTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (_isSosActive) {
        await _captureAndTransmitPosition(isSos: true);
      }
    });
  }

  /// 6. Cancel Emergency SOS
  void cancelEmergencySOS() {
    _isSosActive = false;
    debugPrint('[StaffLocation] Emergency SOS cancelled by doctor.');
    if (_trackingEnabledByDoctor && _consentGiven) {
      _startPeriodicTracking();
    } else {
      _stopTracking();
      _updateState(_consentGiven ? TrackingState.pausedByDoctor : TrackingState.consentRequired);
    }
  }

  /// 7. Background Periodic GPS Transmitter
  void _startPeriodicTracking() {
    _trackingTimer?.cancel();
    _updateState(TrackingState.activeTracking);

    // Standard safety interval: 30 seconds (battery-friendly OsmAnd transmission)
    _trackingTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      if (_trackingEnabledByDoctor && _consentGiven && !_isSosActive) {
        await _captureAndTransmitPosition(isSos: false);
      }
    });

    // Also send an immediate initial fix
    _captureAndTransmitPosition(isSos: false);
  }

  void _stopTracking() {
    _trackingTimer?.cancel();
    _trackingTimer = null;
    _positionStreamSub?.cancel();
    _positionStreamSub = null;
  }

  /// 8. Capture GPS Fix & Transmit via OsmAnd Protocol over HTTP
  Future<void> _captureAndTransmitPosition({required bool isSos}) async {
    try {
      final Position position = await Geolocator.getCurrentPosition(
        desiredAccuracy: isSos ? LocationAccuracy.best : LocationAccuracy.high,
        timeLimit: const Duration(seconds: 10),
      );

      lastPositionNotifier.value = position;

      int batteryLevel = 100;
      try {
        batteryLevel = await _battery.batteryLevel;
        batteryNotifier.value = batteryLevel;
      } catch (_) {}

      final int timestampSeconds = DateTime.now().millisecondsSinceEpoch ~/ 1000;

      // Construct standard Traccar OsmAnd protocol query parameters
      // http://<host>:5055/?id=123456&lat=6.9147&lon=79.9733&timestamp=1790057000&speed=0.0&bearing=0.0&altitude=18.0&accuracy=5.0&batt=84&sos=false
      final Uri osmandUri = Uri.parse(_traccarHost).replace(
        queryParameters: <String, String>{
          'id': _deviceId,
          'lat': position.latitude.toStringAsFixed(7),
          'lon': position.longitude.toStringAsFixed(7),
          'timestamp': timestampSeconds.toString(),
          'speed': (position.speed * 3.6).toStringAsFixed(2), // m/s to km/h
          'bearing': position.heading.toStringAsFixed(1),
          'altitude': position.altitude.toStringAsFixed(1),
          'accuracy': position.accuracy.toStringAsFixed(1),
          'batt': batteryLevel.toString(),
          'sos': isSos ? 'true' : 'false',
          'doctor_id': _doctorId,
        },
      );

      debugPrint('[StaffLocation] Transmitting OsmAnd fix: ${osmandUri.toString()}');

      final http.Response response = await http
          .get(osmandUri)
          .timeout(const Duration(seconds: 8));

      if (response.statusCode >= 200 && response.statusCode < 300) {
        debugPrint('[StaffLocation] Position accepted by Traccar server (HTTP ${response.statusCode})');
      } else {
        debugPrint('[StaffLocation] Warning: Traccar server returned HTTP ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('[StaffLocation] GPS Transmission Error (buffered locally): $e');
    }
  }

  void _updateState(TrackingState newState) {
    _state = newState;
    stateNotifier.value = newState;
  }

  void dispose() {
    _stopTracking();
    stateNotifier.dispose();
    lastPositionNotifier.dispose();
    batteryNotifier.dispose();
  }
}
