/**
 * Integration service that orchestrates the entire batch processing workflow:
 * 1. Process GPS patterns
 * 2. Extract person details from photos
 * 3. Apply AI positioning analysis
 * 4. Create plots on the map
 */

import type { BatchCaptureSession, ProcessedBatch } from "../types/batchCapture";
import { processBatchCapture } from "./batchProcessingService";
import {
  analyzeBatchPositions,
  applyAIPositionCorrections,
} from "./aiPositioningService";
import { headstoneAnalysisService } from "../utils/headstoneAnalysisService";
import {
  createPlotsFromBatch,
  preparePlotDataForInsertion,
  type BatchPlotData,
} from "../utils/batchPlotCreation";
import { usePowerSyncStore } from "../stores/powersync";
import { useMapStore } from "../stores/map";
import { useAuthStore } from "../stores/auth";
import { useLocationsStore } from "../stores/locations";
import { useSettingsStore } from "../stores/settings";
import { DEFAULT_PLOT_SIZE } from "../utils/plotSizes";

export interface BatchProcessingOptions {
  enableAIPositioning?: boolean;
  plotSize?: { width: number; height: number };
  section?: string;
  row?: string;
  numberPrefix?: string;
  status?: string;
}

export interface BatchProcessingResult {
  plotsCreated: number;
  personsExtracted: number;
  plots: any[];
  errors: string[];
}

/**
 * Process a complete batch capture session
 */
export async function processCompleteBatch(
  session: BatchCaptureSession,
  options: BatchProcessingOptions = {},
): Promise<BatchProcessingResult> {
  const errors: string[] = [];
  const powerSyncStore = usePowerSyncStore();
  const mapStore = useMapStore();
  const authStore = useAuthStore();
  const locationsStore = useLocationsStore();
  const settingsStore = useSettingsStore();

  // Ensure PowerSync is initialized
  if (!powerSyncStore.isInitialized && authStore.isAuthenticated) {
    await powerSyncStore.initialize();
  }

  if (!powerSyncStore.powerSync) {
    throw new Error("PowerSync not available");
  }

  const userId = authStore.user?.id || "anonymous";
  const locationId = session.locationId || locationsStore.selectedLocationId || null;
  const plotSize = options.plotSize || DEFAULT_PLOT_SIZE;
  const batchSettings = settingsStore.getBatchCaptureSettings();
  const enableAIPositioning = options.enableAIPositioning ?? batchSettings.enableAIPositioning;

  try {
    // Step 1: Process GPS patterns
    console.log("BatchProcessing: Analyzing GPS patterns...");
    const processedBatch = await processBatchCapture(session);

    // Step 2: Extract person details from all photos in parallel
    console.log("BatchProcessing: Extracting person details from photos...");
    const personExtractionPromises = processedBatch.photos.map(
      async (photo, index) => {
        try {
          // Create temporary plot ID for person association
          const tempPlotId = `temp-${session.id}-${index}`;
          const analysisResult = await headstoneAnalysisService.analyzeHeadstoneImage(
            photo.image.file,
            tempPlotId,
          );

          if (analysisResult.success && analysisResult.persons) {
            photo.personData = analysisResult.persons;
            return analysisResult.persons.length;
          }
          return 0;
        } catch (error) {
          console.error(
            `Error extracting person data from photo ${index + 1}:`,
            error,
          );
          errors.push(
            `Photo ${index + 1}: Failed to extract person details - ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          return 0;
        }
      },
    );

    const personCounts = await Promise.all(personExtractionPromises);
    const totalPersons = personCounts.reduce((sum, count) => sum + count, 0);

    // Step 3: Apply AI positioning if enabled
    if (enableAIPositioning && processedBatch.photos.length > 1) {
      try {
        console.log("BatchProcessing: Analyzing positions with AI...");
        const aiAnalyses = await analyzeBatchPositions(processedBatch.photos);

        if (aiAnalyses.length > 0) {
          // Apply AI corrections to positions
          const basePositions = processedBatch.photos.map((photo) => ({
            latitude: photo.calculatedPosition.latitude,
            longitude: photo.calculatedPosition.longitude,
          }));

          const correctedPositions = applyAIPositionCorrections(
            processedBatch.photos,
            aiAnalyses,
            basePositions,
          );

          // Update calculated positions
          processedBatch.photos.forEach((photo, index) => {
            photo.calculatedPosition = {
              ...correctedPositions[index],
              accuracy: photo.calculatedPosition.accuracy,
            };
          });
        }
      } catch (error) {
        console.error("Error applying AI positioning:", error);
        errors.push(
          `AI positioning failed - ${error instanceof Error ? error.message : "Unknown error"}. Using GPS-only positioning.`,
        );
        // Continue with GPS-only positioning
      }
    }

    // Step 4: Create plot data
    console.log("BatchProcessing: Creating plot geometries...");
    const plotDataList = await createPlotsFromBatch(processedBatch, plotSize);

    // Step 5: Create plots in database
    console.log("BatchProcessing: Creating plots in database...");
    const createdPlots: any[] = [];

    for (let i = 0; i < plotDataList.length; i++) {
      const plotData = plotDataList[i];
      const photo = processedBatch.photos[i];

      try {
        // Prepare plot data for insertion
        const plotRecord = preparePlotDataForInsertion(plotData, {
          section: options.section || "",
          row: options.row || "",
          numberPrefix: options.numberPrefix,
          locationId: locationId || undefined,
          status: options.status || "Active",
          userId,
        });

        // Create plot
        const newPlot = await powerSyncStore.createNewPlot(plotRecord);

        // Add plot to map
        await mapStore.addPlotMarker(newPlot);

        // Process photo and associate with plot
        if (photo.image.blob) {
          try {
            // Upload photo and associate with plot
            await powerSyncStore.addPlotImage(
              newPlot.id,
              photo.image.blob,
              `batch-${session.id}-${i + 1}.jpg`,
              {
                analyzeForHeadstone: false, // Already analyzed above
              },
            );
          } catch (photoError) {
            console.error(`Error uploading photo for plot ${i + 1}:`, photoError);
            errors.push(
              `Plot ${i + 1}: Failed to upload photo - ${photoError instanceof Error ? photoError.message : "Unknown error"}`,
            );
          }
        }

        // Process person data if available
        if (photo.personData && photo.personData.length > 0) {
          try {
            const { usePersonsStore } = await import("../stores/persons");
            const personsStore = usePersonsStore();

            for (const personData of photo.personData) {
              await personsStore.createPerson({
                ...personData,
                plot_id: newPlot.id,
              });
            }
          } catch (personError) {
            console.error(
              `Error creating persons for plot ${i + 1}:`,
              personError,
            );
            errors.push(
              `Plot ${i + 1}: Failed to create person records - ${personError instanceof Error ? personError.message : "Unknown error"}`,
            );
          }
        }

        createdPlots.push(newPlot);
      } catch (plotError) {
        console.error(`Error creating plot ${i + 1}:`, plotError);
        errors.push(
          `Plot ${i + 1}: Failed to create - ${plotError instanceof Error ? plotError.message : "Unknown error"}`,
        );
      }
    }

    // Step 6: Zoom to first plot if available
    if (createdPlots.length > 0) {
      try {
        await mapStore.zoomToPlot(createdPlots[0]);
      } catch (zoomError) {
        console.error("Error zooming to plot:", zoomError);
        // Non-critical error, continue
      }
    }

    return {
      plotsCreated: createdPlots.length,
      personsExtracted: totalPersons,
      plots: createdPlots,
      errors,
    };
  } catch (error) {
    console.error("Error processing batch:", error);
    throw new Error(
      `Batch processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

