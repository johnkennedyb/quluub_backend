const jwt = require('jsonwebtoken');
const axios = require('axios');
const zoomConfig = require('../config/zoom');
const User = require('../models/User');
const { sendWaliVideoCallNotification } = require('../utils/emailService');

class ZoomService {
  constructor() {
    this.apiBaseUrl = zoomConfig.API_BASE_URL;
  }

  // Generate JWT token for Zoom API authentication
  generateJWT() {
    const payload = {
      iss: zoomConfig.API_KEY,
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiration
    };
    
    return jwt.sign(payload, zoomConfig.API_SECRET);
  }

  // Generate SDK JWT for client-side Zoom SDK
  generateSDKJWT(meetingNumber, role = 0) {
    const payload = {
      iss: zoomConfig.SDK_KEY,
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour expiration
      aud: 'zoom',
      appKey: zoomConfig.SDK_KEY,
      tokenExp: Math.floor(Date.now() / 1000) + (60 * 60),
      alg: 'HS256'
    };

    return jwt.sign(payload, zoomConfig.SDK_SECRET);
  }

  // Create a Zoom meeting with 5-minute duration limit
  async createMeeting(hostUserId, participantUserId, topic = 'Quluub Video Call') {
    try {
      const token = this.generateJWT();
      
      const meetingData = {
        topic: topic,
        type: 1, // Instant meeting
        duration: zoomConfig.MEETING_DURATION, // 5 minutes
        timezone: 'UTC',
        settings: {
          host_video: true,
          participant_video: true,
          cn_meeting: false,
          in_meeting: false,
          join_before_host: false,
          mute_upon_entry: false,
          watermark: false,
          use_pmi: false,
          approval_type: 2, // No registration required
          audio: 'both',
          auto_recording: zoomConfig.AUTO_RECORDING ? 'cloud' : 'none',
          enforce_login: false,
          enforce_login_domains: '',
          alternative_hosts: '',
          close_registration: false,
          show_share_button: false,
          allow_multiple_devices: false,
          registrants_confirmation_email: false,
          waiting_room: false,
          request_permission_to_unmute_participants: false,
          global_dial_in_countries: ['US'],
          registration_type: 1
        }
      };

      const response = await axios.post(
        `${this.apiBaseUrl}/users/me/meetings`,
        meetingData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const meeting = response.data;
      
      // Generate SDK JWT for this specific meeting
      const sdkJWT = this.generateSDKJWT(meeting.id);
      
      // Send notification to Wali about the video call
      await this.notifyWaliAboutCall(hostUserId, participantUserId, meeting);
      
      return {
        meetingId: meeting.id,
        meetingNumber: meeting.id,
        password: meeting.password,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        sdkJWT: sdkJWT,
        duration: zoomConfig.MEETING_DURATION,
        topic: meeting.topic,
        startTime: meeting.start_time
      };
    } catch (error) {
      console.error('Error creating Zoom meeting:', error.response?.data || error.message);
      throw new Error('Failed to create video call meeting');
    }
  }

  // Get meeting details
  async getMeetingDetails(meetingId) {
    try {
      const token = this.generateJWT();
      
      const response = await axios.get(
        `${this.apiBaseUrl}/meetings/${meetingId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting meeting details:', error.response?.data || error.message);
      throw new Error('Failed to get meeting details');
    }
  }

  // Get meeting recordings
  async getMeetingRecordings(meetingId) {
    try {
      const token = this.generateJWT();
      
      const response = await axios.get(
        `${this.apiBaseUrl}/meetings/${meetingId}/recordings`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting meeting recordings:', error.response?.data || error.message);
      return null;
    }
  }

  // Send notification to Wali about video call
  async notifyWaliAboutCall(hostUserId, participantUserId, meetingDetails) {
    try {
      const [hostUser, participantUser] = await Promise.all([
        User.findById(hostUserId),
        User.findById(participantUserId)
      ]);

      if (!hostUser || !participantUser) {
        console.error('Users not found for Wali notification');
        return;
      }

      // Notify host's Wali if female
      if (hostUser.gender === 'female' && hostUser.waliDetails) {
        try {
          const waliDetails = JSON.parse(hostUser.waliDetails);
          if (waliDetails.email) {
            await sendWaliVideoCallNotification(
              waliDetails.email,
              waliDetails.name || 'Wali',
              hostUser.fname,
              participantUser.fname,
              {
                meetingId: meetingDetails.id,
                joinUrl: meetingDetails.join_url,
                startTime: meetingDetails.start_time,
                duration: zoomConfig.MEETING_DURATION,
                topic: meetingDetails.topic
              }
            );
          }
        } catch (e) {
          console.error('Error parsing host wali details:', e);
        }
      }

      // Notify participant's Wali if female
      if (participantUser.gender === 'female' && participantUser.waliDetails) {
        try {
          const waliDetails = JSON.parse(participantUser.waliDetails);
          if (waliDetails.email) {
            await sendWaliVideoCallNotification(
              waliDetails.email,
              waliDetails.name || 'Wali',
              participantUser.fname,
              hostUser.fname,
              {
                meetingId: meetingDetails.id,
                joinUrl: meetingDetails.join_url,
                startTime: meetingDetails.start_time,
                duration: zoomConfig.MEETING_DURATION,
                topic: meetingDetails.topic
              }
            );
          }
        } catch (e) {
          console.error('Error parsing participant wali details:', e);
        }
      }
    } catch (error) {
      console.error('Error sending Wali notification:', error);
    }
  }

  // Handle webhook events from Zoom
  async handleWebhook(event) {
    try {
      switch (event.event) {
        case 'meeting.ended':
          await this.handleMeetingEnded(event.payload);
          break;
        case 'recording.completed':
          await this.handleRecordingCompleted(event.payload);
          break;
        default:
          console.log('Unhandled Zoom webhook event:', event.event);
      }
    } catch (error) {
      console.error('Error handling Zoom webhook:', error);
    }
  }

  // Handle meeting ended event
  async handleMeetingEnded(payload) {
    try {
      const meetingId = payload.object.id;
      console.log(`Meeting ${meetingId} has ended`);
      
      // Wait a bit for recordings to be processed
      setTimeout(async () => {
        const recordings = await this.getMeetingRecordings(meetingId);
        if (recordings && recordings.recording_files) {
          await this.sendRecordingsToWali(meetingId, recordings);
        }
      }, 30000); // Wait 30 seconds for recording processing
    } catch (error) {
      console.error('Error handling meeting ended:', error);
    }
  }

  // Handle recording completed event
  async handleRecordingCompleted(payload) {
    try {
      const meetingId = payload.object.id;
      const recordings = payload.object;
      
      await this.sendRecordingsToWali(meetingId, recordings);
    } catch (error) {
      console.error('Error handling recording completed:', error);
    }
  }

  // Send recordings to Wali
  async sendRecordingsToWali(meetingId, recordings) {
    try {
      // This would need to be implemented based on how you store meeting participant info
      // For now, we'll log the recording details
      console.log('Recording completed for meeting:', meetingId);
      console.log('Recording files:', recordings.recording_files);
      
      // TODO: Implement logic to identify meeting participants and send recordings to their Walis
      // This would require storing meeting participant information when the meeting is created
    } catch (error) {
      console.error('Error sending recordings to Wali:', error);
    }
  }
}

module.exports = new ZoomService();
