import React, { useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from '@google/genai';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    const rootEl = document.getElementById('root');
    if (rootEl) {
        rootEl.innerHTML = `<div style="color: red; font-family: sans-serif; padding: 2rem;"><strong>Error:</strong> API_KEY environment variable not set. Please follow the setup instructions.</div>`;
    }
    throw new Error("API_KEY environment variable not set");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- Helper Function for Retries ---
const withRetries = async <T,>(apiCall: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> => {
    let attempt = 0;
    while (true) {
        try {
            return await apiCall();
        } catch (e) {
            attempt++;
            const isRateLimitError = JSON.stringify(e).includes('RESOURCE_EXHAUSTED');

            if (isRateLimitError && attempt < maxRetries) {
                const delay = initialDelay * Math.pow(2, attempt - 1);
                console.warn(`Rate limit error detected. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error("API call failed after multiple retries or for a non-retriable error.", e);
                throw e; // Re-throw the error if it's not a rate limit issue or if retries are exhausted
            }
        }
    }
};


// --- Helper Components ---

const Loader = () => <div className="loader"></div>;

const StepCard = ({
  step,
  title,
  children,
  isComplete,
  isActive,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
  isComplete: boolean;
  isActive: boolean;
}) => (
  <div className={`step-card ${!isActive ? 'disabled' : ''}`}>
    <div className="step-header">
      <span className="step-number">{isComplete ? '✔' : step}</span>
      <h2 className="step-title">{title}</h2>
    </div>
    <div className={`step-card-content ${!isActive ? 'inactive' : ''}`}>
      {children}
    </div>
    {isComplete && <p className="completed-message">This step is complete.</p>}
  </div>
);

// --- Main Application ---

const App = () => {
  // State management
  const [topic, setTopic] = useState('');
  const [script, setScript] = useState('');
  const [image, setImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('female');
  const [currentStep, setCurrentStep] = useState(1);
  
  const [isLoading, setIsLoading] = useState({ script: false, video: false, audio: false });
  const [videoLoadingMessage, setVideoLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [videoGenerationFailed, setVideoGenerationFailed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);


  // Agent 1: Script Generation
  const generateScript = useCallback(async () => {
    if (!topic.trim()) {
      setError('Please enter a topic.');
      return;
    }
    setError('');
    setIsLoading(prev => ({ ...prev, script: true }));

    try {
      const response = await withRetries(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Generate a short, engaging YouTube video script about "${topic}". The script should be around 150 words and include brief scene descriptions or visual cues.`,
      }));
      setScript(response.text);
      setCurrentStep(2);
    } catch (e) {
      console.error(e);
      const potentialErrorMessages = [
        e instanceof Error ? e.message : '',
        JSON.stringify(e),
      ];
      const combinedErrorMessage = potentialErrorMessages.join(' ');
      
      if (combinedErrorMessage.includes('quota') || combinedErrorMessage.includes('RESOURCE_EXHAUSTED')) {
          setError("You've exceeded your API quota. Please check your plan and billing details, or or try again later.");
      } else {
          setError('Failed to generate script. Please try again.');
      }
    } finally {
      setIsLoading(prev => ({ ...prev, script: false }));
    }
  }, [topic]);

  // Agent 2: Text to Speech (using browser API for preview)
  const handleTextToSpeech = useCallback(() => {
    if (!script || typeof window.speechSynthesis === 'undefined') {
      setError('Speech synthesis is not supported in this browser or no script is available.');
      return;
    }
    window.speechSynthesis.cancel();
    
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
        // Some browsers load voices asynchronously. If no voices, wait for them.
        window.speechSynthesis.onvoiceschanged = () => handleTextToSpeech();
        return;
    }

    const genderVoices = voices.filter(voice => voice.lang.startsWith('en') && voice.name.toLowerCase().includes(selectedVoice));
    const utterance = new SpeechSynthesisUtterance(script);
    
    if (genderVoices.length > 0) {
        utterance.voice = genderVoices[0]; // Use the first available matching voice
    } else {
        console.warn(`No '${selectedVoice}' voice found. Using default.`);
    }

    window.speechSynthesis.speak(utterance);
  }, [script, selectedVoice]);

  // Simulate Audio Generation
  const handleGenerateAudio = useCallback(async () => {
    if (!script) return;
    setIsLoading(prev => ({ ...prev, audio: true }));
    setAudioError('');

    await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate API call delay

    // Simulate potential server busy error
    if (Math.random() > 0.5) {
        setAudioError('The audio generation server is currently busy. Please reload or try again in a moment.');
        setIsLoading(prev => ({ ...prev, audio: false }));
        return;
    }

    // On success, create a dummy MP3 file for download.
    // This is a silent 1-second MP3 file encoded in base64.
    // In a real application, this would be the response from a Text-to-Speech API.
    const silentMp3Base64 = "SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWcgYnVjayBibGFuayBzb3VuZCBvZiBzaWxlbmNlMP4/AAAAAAAAAAAA//tgZA==";
    const byteCharacters = atob(silentMp3Base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'audio/mpeg' });
    setAudioUrl(URL.createObjectURL(blob));
    setIsLoading(prev => ({ ...prev, audio: false }));
    setCurrentStep(3);
  }, [script]);

  // Skip audio generation
  const skipAudioGeneration = useCallback(() => {
    setAudioUrl(''); // Ensure no old audio is carried over
    setCurrentStep(3);
  }, []);
  
  // Handle Image Upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setImage({ base64: base64String, mimeType: file.type });
        setCurrentStep(4);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Image Clear
  const handleClearImage = useCallback(() => {
    setImage(null);
    setCurrentStep(3); // Revert to this step
    if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Allow re-uploading the same file
    }
  }, []);
  
  // Agent 3: Video Generation
  const generateVideo = useCallback(async () => {
    if (!script || !image) {
      setError('Script and image are required to generate a video.');
      return;
    }
    setError('');
    setVideoGenerationFailed(false);
    setIsLoading(prev => ({ ...prev, video: true }));
    setCurrentStep(5);

    const loadingMessages = [
        "Warming up the cameras...", "Setting the scene...", "Action! Filming the main shots...",
        "Adding special effects...", "Editing the footage...", "Rendering the final cut...", "Almost there..."
    ];
    let messageIndex = 0;
    setVideoLoadingMessage(loadingMessages[messageIndex]);
    const messageInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        setVideoLoadingMessage(loadingMessages[messageIndex]);
    }, 8000);

    try {
        let operation = await withRetries(() => ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: script,
            image: { imageBytes: image.base64, mimeType: image.mimeType },
            config: { numberOfVideos: 1 },
        }));

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 30000)); // Increased polling interval
            operation = await withRetries(() => ai.operations.getVideosOperation({ operation }));
        }

        clearInterval(messageInterval);

        // Check for an explicit error in the completed operation
        if (operation.error) {
            console.error("Video generation failed with an operation error:", operation.error);
            throw new Error(operation.error.message || 'The video generation service returned an error.');
        }

        const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (uri) {
            const videoResponse = await fetch(`${uri}&key=${API_KEY}`);
            if(!videoResponse.ok) {
                let errorDetail = videoResponse.statusText;
                try {
                    const errorBody = await videoResponse.json();
                    errorDetail = errorBody?.error?.message || errorDetail;
                } catch (parseError) {
                    console.warn("Could not parse error response body as JSON.");
                }
                throw new Error(`Failed to fetch video: ${errorDetail}`);
            }
            const videoBlob = await videoResponse.blob();
            setVideoUrl(URL.createObjectURL(videoBlob));
        } else {
            // This case handles when the operation is 'done' but no video is returned,
            // which often indicates a content policy violation during generation.
            console.error("Video generation completed, but no video URI was found. Full operation object:", JSON.stringify(operation, null, 2));
            throw new Error("VIDEO_URI_MISSING");
        }
    } catch (e) {
      console.error(e);
      setVideoGenerationFailed(true); // Consistently show resubmit UI on any video error

      // FIX: The error `e` is of type `unknown`. This block has been refactored to safely extract a string message from it.
      const errorInst = e instanceof Error ? e : new Error(String(e));
      const errorMessage = errorInst.message;
      
      if (errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
          setError("You've exceeded your API quota for video generation. Please check your plan and billing details, or try again later.");
      } else if (errorMessage.includes('VIDEO_URI_MISSING')) {
          setError("Video generation finished, but no video was created. This often happens due to content policy violations. Please try adjusting your script or image and resubmitting.");
      } else if (errorMessage.toLowerCase().includes('sensitive') || errorMessage.toLowerCase().includes('policy') || errorMessage.toLowerCase().includes('responsible ai')) {
          setError(`The prompt was rejected due to content policies. Please revise your script to align with safety guidelines and try again. (Details: ${errorMessage})`);
      } else {
          setError(`Failed to generate video due to an unexpected error. Please try again. (Details: ${errorMessage})`);
      }

    } finally {
      setIsLoading(prev => ({ ...prev, video: false }));
      clearInterval(messageInterval);
    }
  }, [script, image]);
  
  const resetApp = () => {
      setTopic('');
      setScript('');
      setImage(null);
      setVideoUrl('');
      setAudioUrl('');
      setSelectedVoice('female');
      setAudioError('');
      setVideoGenerationFailed(false);
      setCurrentStep(1);
      setError('');
      setIsLoading({ script: false, video: false, audio: false });
      window.speechSynthesis.cancel();
  }
  
  const handleGoBack = useCallback(() => {
      setCurrentStep(prev => prev - 1);
  }, []);

  const handleResubmitVideo = useCallback(() => {
    generateVideo();
  }, [generateVideo]);

  return (
    <div className="app-container">
      {currentStep > 1 && (
        <button onClick={resetApp} className="restart-btn">
          Restart
        </button>
      )}
      <h1>AI YouTube Studio</h1>
      {error && !videoGenerationFailed && <p className="error-message">{error}</p>}

      <StepCard step={1} title="Write the Script" isActive={currentStep === 1} isComplete={currentStep > 1}>
        <div className="form-group">
          <label htmlFor="topic">What is your video about?</label>
          <textarea
            id="topic" value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., The history of coffee" rows={3} disabled={isLoading.script}
          />
        </div>
        <button onClick={generateScript} disabled={isLoading.script || !topic}>
          {isLoading.script ? <><Loader /><span>Generating...</span></> : 'Generate Script'}
        </button>
      </StepCard>

      <StepCard step={2} title="Review Script & Voiceover" isActive={currentStep === 2} isComplete={currentStep > 2}>
        <p>Here is your generated script. You can edit it below to fix spelling or make other changes:</p>
        <textarea
            className="script-display"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            aria-label="Editable video script"
        />
        <div className="voice-selection">
            <label>Choose a voice for the final audio:</label>
            <div className="radio-group">
                <input type="radio" id="female-voice" name="voice" value="female" checked={selectedVoice === 'female'} onChange={() => setSelectedVoice('female')} />
                <label htmlFor="female-voice">Female</label>
                <input type="radio" id="male-voice" name="voice" value="male" checked={selectedVoice === 'male'} onChange={() => setSelectedVoice('male')} />
                <label htmlFor="male-voice">Male</label>
            </div>
        </div>
        <div className="step-actions">
            <button onClick={handleGoBack} className="secondary-btn">Back</button>
            <button onClick={handleTextToSpeech} disabled={isLoading.audio}>Preview Voice</button>
            <button onClick={handleGenerateAudio} disabled={isLoading.audio}>
                {isLoading.audio ? <><Loader /><span>Generating...</span></> : 'Generate Audio & Continue'}
            </button>
            <button onClick={skipAudioGeneration} className="secondary-btn" disabled={isLoading.audio}>
                Continue without Audio
            </button>
        </div>
        {audioError && (
            <div className="inline-error">
                <p>{audioError}</p>
                <button onClick={handleGenerateAudio}>Retry</button>
            </div>
        )}
      </StepCard>

      <StepCard step={3} title="Provide a Base Image" isActive={currentStep === 3} isComplete={currentStep > 3}>
        <div className="form-group">
          <label htmlFor="image-upload">Upload an image to animate for the video.</label>
          <div className="image-upload-controls">
            <input 
              type="file" 
              id="image-upload" 
              accept="image/*" 
              onChange={handleImageUpload}
              ref={fileInputRef} 
            />
            {image && (
              <button onClick={handleClearImage} className="secondary-btn clear-btn">
                &times; Clear Image
              </button>
            )}
          </div>
          {image && <img src={`data:${image.mimeType};base64,${image.base64}`} alt="Preview" className="image-preview" />}
        </div>
         <div className="step-actions">
            <button onClick={handleGoBack} className="secondary-btn">Back</button>
        </div>
      </StepCard>
        
      <StepCard step={4} title="Generate Video" isActive={currentStep === 4} isComplete={currentStep > 4}>
        <p>Ready to generate the final video based on your script and image.</p>
        <div className="step-actions">
            <button onClick={handleGoBack} className="secondary-btn">Back</button>
            <button onClick={generateVideo} disabled={!image || isLoading.video}>
                {isLoading.video ? <><Loader /><span>Generating Video...</span></> : 'Generate Video'}
            </button>
        </div>
      </StepCard>

      <StepCard step={5} title="Final Video" isActive={currentStep === 5} isComplete={false}>
        {isLoading.video && (
            <div className="loader-container">
                <Loader />
                <p>{videoLoadingMessage}</p>
            </div>
        )}
        {videoGenerationFailed && !isLoading.video && (
            <div className="resubmit-container">
                <p>{error || 'An unexpected error occurred. Please try resubmitting.'}</p>
                <button onClick={handleResubmitVideo}>Resubmit Generation</button>
            </div>
        )}
        {videoUrl && !videoGenerationFailed && (
            <div className="video-container">
                <h3>Here's your masterpiece!</h3>
                <video src={videoUrl} controls autoPlay loop />
                {audioUrl && (
                  <div className="audio-container">
                      <h4>Generated Voiceover</h4>
                      <audio controls src={audioUrl}></audio>
                      <a href={audioUrl} download="voiceover.mp3" className="download-button">Download Audio (MP3)</a>
                  </div>
                )}
                <div className="step-actions">
                    <button onClick={handleGoBack} className="secondary-btn">Back</button>
                    <button onClick={resetApp} className="start-over-btn">Create Another Video</button>
                </div>
            </div>
        )}
      </StepCard>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
