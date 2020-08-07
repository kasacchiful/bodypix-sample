import "babel-polyfill";
import * as bodyPix from '@tensorflow-models/body-pix';
import {isMobile, toggleLoadingUI} from "./utils.js"

const state = {
  algorithm: 'multi-person-instance',
  net: null,
  video: null,
  flipHorizontally: true,
  opacity: 0.9,
  maskBlurAmount: 3
}

const segmentationOption = {
  internalResolution: 'medium',
  outputStride: 16,
  multiplier: 0.75,
  quantBytes: 2,
  segmentationThreshold: 0.7,
  multiDecodingMaxDetections: 5,
  multiDecodingScoreThreshold: 0.3,
  multiDecodingNmsRadius: 20,
  multiDecodingNumKeypointForMatching: 17,
  multiDecodingRefineSteps: 10
}

function getFacingMode(cameraLabel) {
  if (!cameraLabel) {
    return 'user';
  }
  if (cameraLabel.toLowerCase().includes('back')) {
    return 'environment';
  } else {
    return 'user';
  }
}

async function getVideoInputs() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    console.log('enumerateDevices() not supported.');
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');
  return videoDevices;
}

function stopExistingVideoCapture() {
  if (state.video && state.video.srcObject) {
    state.video.srcObject.getTracks().forEach(track => {
      track.stop();
    })
    state.video.srcObject = null;
  }
}

async function getDeviceIdForLabel(cameraLabel) {
  const videoInputs = await getVideoInputs();

  for (let i = 0; i < videoInputs.length; i++) {
    const videoInput = videoInputs[i];
    if (videoInput.label === cameraLabel) {
      return videoInput.deviceId;
    }
  }

  return null;
}

async function getConstraints(cameraLabel) {
  let deviceId;
  let facingMode;

  if (cameraLabel) {
    deviceId = await getDeviceIdForLabel(cameraLabel);
    // on mobile, use the facing mode based on the camera.
    facingMode = isMobile() ? getFacingMode(cameraLabel) : null;
  };
  return {deviceId, facingMode};
}

async function setupCamera(cameraLabel) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error(
      'Browser API navigator.mediaDevices.getUserMedia not available');
  }

  const videoElement = document.getElementById('video');
  stopExistingVideoCapture();
  const videoConstraints = await getConstraints(cameraLabel);

  const stream = await navigator.mediaDevices.getUserMedia(
    {'audio': false, 'video': videoConstraints});
  videoElement.srcObject = stream;

  return new Promise((resolve) => {
    videoElement.onloadedmetadata = () => {
      videoElement.width = videoElement.videoWidth;
      videoElement.height = videoElement.videoHeight;
      resolve(videoElement);
    };
  });
}

async function loadVideo(cameraLabel) {
  try {
    state.video = await setupCamera(cameraLabel);
  } catch (e) {
    let info = document.getElementById('info');
    info.textContent = 'this browser does not support video capture,' +
      'or this device does not have a camera';
    info.style.display = 'block';
    throw e;
  }
  state.video.play();
}

async function loadBodyPix() {
  toggleLoadingUI(true);
  state.net = await bodyPix.load({
    architecture: 'MobileNetV1',
    outputStride: 16,
    multiplier: 0.75,
    quantBytes: 2
  });
  toggleLoadingUI(false);
}

async function estimateSegmentation() {
  let multiPersonSegmentation = null;
  switch (state.algorithm) {
    case 'multi-person-instance':
      return await state.net.segmentMultiPerson(state.video, {
        internalResolution: segmentationOption.internalResolution,
        segmentationThreshold: segmentationOption.segmentationThreshold,
        maxDetections: segmentationOption.multiDecodingMaxDetections,
        scoreThreshold: segmentationOption.multiDecodingScoreThreshold,
        nmsRadius: segmentationOption.multiDecodingNmsRadius,
        numKeypointForMatching:
          segmentationOption.multiDecodingNumKeypointForMatching,
        refineSteps: segmentationOption.multiDecodingRefineSteps
      });
    case 'person':
      return await state.net.segmentPerson(state.video, {
        internalResolution: segmentationOption.internalResolution,
        segmentationThreshold: segmentationOption.segmentationThreshold,
        maxDetections: segmentationOption.multiDecodingMaxDetections,
        scoreThreshold: segmentationOption.multiDecodingScoreThreshold,
        nmsRadius: segmentationOption.multiDecodingNmsRadius,
      });
    default:
      break;
  };
  return multiPersonSegmentation;
}

async function estimatePartSegmentation() {
  switch (state.algorithm) {
    case 'multi-person-instance':
      return await state.net.segmentMultiPersonParts(state.video, {
        internalResolution: segmentationOption.internalResolution,
        segmentationThreshold: segmentationOption.segmentationThreshold,
        maxDetections: segmentationOption.multiDecodingMaxDetections,
        scoreThreshold: segmentationOption.multiDecodingScoreThreshold,
        nmsRadius: segmentationOption.multiDecodingNmsRadius,
        numKeypointForMatching:
          segmentationOption.multiDecodingNumKeypointForMatching,
        refineSteps: segmentationOption.multiDecodingRefineSteps
      });
    case 'person':
      return await state.net.segmentPersonParts(state.video, {
        internalResolution: segmentationOption.internalResolution,
        segmentationThreshold: segmentationOption.segmentationThreshold,
        maxDetections: segmentationOption.multiDecodingMaxDetections,
        scoreThreshold: segmentationOption.multiDecodingScoreThreshold,
        nmsRadius: segmentationOption.multiDecodingNmsRadius,
      });
    default:
      break;
  };
  return multiPersonPartSegmentation;
}

function segmentBodyInRealTime() {
  const canvas = document.getElementById('output');

  async function bodySegmentationFrame() {
    // segmentation
    const multiPersonSegmentation = await estimateSegmentation();
    const ctx = canvas.getContext('2d');
    const foregroundColor = {r: 255, g: 255, b: 255, a: 255};
    const backgroundColor = {r: 0, g: 0, b: 0, a: 255};
    const mask = bodyPix.toMask(
      multiPersonSegmentation, foregroundColor, backgroundColor, true);
    bodyPix.drawMask(
      canvas, state.video, mask, state.opacity,
      state.maskBlurAmount, state.flipHorizontally);

    requestAnimationFrame(bodySegmentationFrame);
  }
  bodySegmentationFrame();
}

export async function bindPage() {
  await loadBodyPix();
  document.getElementById('loading').style.display = 'none';
  document.getElementById('main').style.display = 'inline-block';

  let cameras = await getVideoInputs();
  await loadVideo(cameras[0].label);

  segmentBodyInRealTime();
}

bindPage();
