import EditorJS from "@editorjs/editorjs";
import Header from "@editorjs/header";
import EditorjsList from "@editorjs/list";
import Quote from "@editorjs/quote";
import LinkTool from "@editorjs/link";
import RawTool from "@editorjs/raw";
import ImageTool from "@editorjs/image";
import Embed from "@editorjs/embed";

export default {
  mounted() {
    this.initializeState();
    this.setupEventHandlers();
    this.initializeEditor();
    this.setupSaveButton();
  },

  destroyed() {
    this.cleanup();
  },

  // Initialize component state
  initializeState() {
    this.editor = null;
    this.saveButton = null;
    this.currentUploadResolve = null;
    this.currentUploadReject = null;
    this.uploadTimeout = null;
    this.isDestroyed = false;
  },

  // Setup all event handlers
  setupEventHandlers() {
    // LiveView upload response handlers
    this.handleEvent("upload_complete", this.handleUploadComplete.bind(this));
    this.handleEvent("upload_error", this.handleUploadError.bind(this));

    // Editor validation responses
    this.handleEvent(
      "content_validated",
      this.handleContentValidated.bind(this),
    );
    this.handleEvent("content_saved", this.handleContentSaved.bind(this));
    this.handleEvent("save_error", this.handleSaveError.bind(this));

    // Add debugging for upload events
    this.handleEvent("phx:upload-progress", (data) => {
      console.log("Upload progress event:", data);
    });
  },

  // Initialize EditorJS instance
  async initializeEditor() {
    try {
      const editorConfig = this.buildEditorConfig();
      this.editor = new EditorJS(editorConfig);
      await this.editor.isReady;
      this.onEditorReady();
    } catch (error) {
      console.error("Failed to initialize editor:", error);
      this.handleEditorError(error);
    }
  },

  // Build editor configuration
  buildEditorConfig() {
    return {
      holder: this.el.id,
      inlineToolbar: ["link", "bold", "italic"],
      placeholder: this.getDataAttribute("placeholder", "Start writing..."),
      autofocus: this.getDataAttribute("autofocus") === "true",
      onReady: () => console.log("Editor.js is ready!"),
      onChange: this.debounce(this.onEditorChange.bind(this), 300),
      data: this.parseInitialData(),
      tools: this.getToolsConfig(),
      // i18n: {
      //   messages: {
      //     ui: {
      //       blockTunes: {
      //         toggler: {
      //           "Click to tune": "Click to tune",
      //         },
      //       },
      //     },
      //   },
      // },
    };
  },

  // Parse initial editor data
  parseInitialData() {
    const formData = this.getDataAttribute("formData");
    if (!formData) return { blocks: [] };

    try {
      const parsed = JSON.parse(formData);
      return this.validateEditorData(parsed) ? parsed : { blocks: [] };
    } catch (error) {
      console.warn("Invalid initial data:", error);
      return { blocks: [] };
    }
  },

  // Validate editor data structure
  validateEditorData(data) {
    return data && typeof data === "object" && Array.isArray(data.blocks);
  },

  // Get data attribute with fallback
  getDataAttribute(key, fallback = null) {
    return this.el.dataset[key] || fallback;
  },

  // Configure editor tools
  getToolsConfig() {
    return {
      header: this.getHeaderConfig(),
      list: this.getListConfig(),
      linkTool: this.getLinkConfig(),
      image: this.getImageConfig(),
      embed: this.getEmbedConfig(),
      raw: this.getRawConfig(),
      quote: this.getQuoteConfig(),
    };
  },

  getHeaderConfig() {
    return {
      class: Header,
      inlineToolbar: true,
      shortcut: "CMD+SHIFT+H",
      config: {
        placeholder: "Enter a header",
        levels: [1, 2, 3, 4],
        defaultLevel: 2,
      },
    };
  },

  getListConfig() {
    return {
      class: EditorjsList,
      inlineToolbar: true,
      config: {
        defaultStyle: "unordered",
      },
    };
  },

  getLinkConfig() {
    return {
      class: LinkTool,
      config: {
        endpoint: "/api/fetch-link-data", // Optional: for link preview
      },
    };
  },

  getImageConfig() {
    return {
      class: ImageTool,
      config: {
        uploader: {
          uploadByFile: this.uploadImageByFile.bind(this),
          uploadByUrl: this.uploadImageByUrl.bind(this),
        },
        captionPlaceholder: "Enter image caption",
      },
    };
  },

  getEmbedConfig() {
    return {
      class: Embed,
      inlineToolbar: true,
      config: {
        services: {
          youtube: true,
          twitter: true,
          instagram: true,
          codepen: true,
        },
      },
    };
  },

  getRawConfig() {
    return {
      class: RawTool,
      config: {
        placeholder: "Enter raw HTML",
      },
    };
  },

  getQuoteConfig() {
    return {
      class: Quote,
      inlineToolbar: true,
      shortcut: "CMD+SHIFT+O",
      config: {
        quotePlaceholder: "Enter a quote",
        captionPlaceholder: "Quote's author",
      },
    };
  },
  // Handle file uploads
  async uploadImageByFile(file) {
    try {
      console.log("Starting file upload for:", file.name, "Size:", file.size);
      this.validateImageFile(file);

      // Create FormData for direct upload
      const formData = new FormData();
      formData.append("file", file);

      // Get CSRF token from meta tag
      const csrfToken = document
        .querySelector('meta[name="csrf-token"]')
        ?.getAttribute("content");

      // Upload file directly using fetch
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
        headers: {
          "X-CSRF-Token": csrfToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }

      const result = await response.json();
      console.log("Upload completed with result:", result);
      return this.formatUploadResponse(result);
    } catch (error) {
      console.error("File upload failed:", error);
      return this.formatUploadError(error);
    }
  },

  // Handle URL uploads
  async uploadImageByUrl(url) {
    const uploadId = this.generateUploadId();

    try {
      this.validateImageUrl(url);

      const uploadPromise = this.createUploadPromise(uploadId);

      this.pushEvent("upload_editor_image_by_url", {
        upload_id: uploadId,
        url: url,
      });

      const result = await uploadPromise;
      return this.formatUploadResponse(result);
    } catch (error) {
      console.error("URL upload failed:", error);
      return this.formatUploadError(error);
    }
  },

  // Validate image file
  validateImageFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];

    if (file.size > maxSize) {
      throw new Error("File size exceeds 10MB limit");
    }

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Invalid file type. Only images are allowed.");
    }
  },

  // Validate image URL
  validateImageUrl(url) {
    const imageExtensions = /\.(jpg|jpeg|png|gif|bmp|webp|svg)(\?.*)?$/i;
    const allowedDomains = ["imgur.com", "unsplash.com", "picsum.photos"];

    try {
      const urlObj = new URL(url);

      // Check if URL has image extension or is from allowed domains
      const hasImageExtension = imageExtensions.test(urlObj.pathname);
      const isAllowedDomain = allowedDomains.some((domain) =>
        urlObj.hostname.includes(domain),
      );

      if (!hasImageExtension && !isAllowedDomain) {
        throw new Error("Invalid image URL");
      }

      return true;
    } catch {
      throw new Error("Invalid URL format");
    }
  },

  // Handle upload completion from LiveView
  handleUploadComplete(response) {
    console.log("Received upload_complete event:", response);
    const { success, url, alt, caption } = response;

    if (this.uploadTimeout) {
      clearTimeout(this.uploadTimeout);
      this.uploadTimeout = null;
    }

    if (this.currentUploadResolve) {
      if (success) {
        console.log("Upload successful, resolving with:", {
          url,
          alt,
          caption,
        });
        this.currentUploadResolve({ url, alt, caption });
      } else {
        console.error("Upload failed, rejecting");
        this.currentUploadReject(new Error("Upload failed"));
      }
      this.currentUploadResolve = null;
      this.currentUploadReject = null;
    } else {
      console.warn("No upload promise to resolve");
    }
  },

  // Handle upload errors from LiveView
  handleUploadError(error) {
    console.error("Received upload_error event:", error);
    const { message } = error;

    if (this.uploadTimeout) {
      clearTimeout(this.uploadTimeout);
      this.uploadTimeout = null;
    }

    if (this.currentUploadReject) {
      console.error("Rejecting upload promise with error:", message);
      this.currentUploadReject(new Error(message || "Upload failed"));
      this.currentUploadResolve = null;
      this.currentUploadReject = null;
    } else {
      console.warn("No upload promise to reject");
    }
  },

  // Format successful upload response
  formatUploadResponse(result) {
    // If the result is already in the correct format, return it
    if (result.success !== undefined) {
      return result;
    }

    // Otherwise, format it
    return {
      success: 1,
      file: {
        url: result.url,
        alt: result.alt || "",
        caption: result.caption || "",
      },
    };
  },

  // Format upload error response
  formatUploadError(error) {
    // If the error is already in the correct format, return it
    if (error.success !== undefined) {
      return error;
    }

    return {
      success: 0,
      error: error.message || "Upload failed",
    };
  },

  // Editor event handlers
  onEditorReady() {
    console.log("Editor is ready!");
    this.enableAutoSave();
  },

  onEditorChange(api, event) {
    if (this.isDestroyed) return;

    this.enableSaveButton();
    this.scheduleAutoSave();
  },

  // Auto-save functionality
  enableAutoSave() {
    this.autoSaveInterval = setInterval(() => {
      this.autoSave();
    }, 30000); // Auto-save every 30 seconds
  },

  async autoSave() {
    if (!this.editor || this.isDestroyed) return;

    try {
      const data = await this.editor.save();
      if (!this.isEmptyContent(data)) {
        this.pushEvent("auto_save", data);
      }
    } catch (error) {
      console.warn("Auto-save failed:", error);
    }
  },

  scheduleAutoSave() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = setTimeout(() => {
      this.autoSave();
    }, 5000); // Save 5 seconds after last change
  },

  // Save button management
  setupSaveButton() {
    this.saveButton = this.findSaveButton();
    if (!this.saveButton) {
      console.warn("Save button not found");
      return;
    }

    this.disableSaveButton();
    this.saveButton.addEventListener("click", this.handleSave.bind(this));
  },

  findSaveButton() {
    return (
      document.querySelector("#save") ||
      document.querySelector('[data-save="true"]') ||
      document.querySelector(".save-button")
    );
  },

  enableSaveButton() {
    if (this.saveButton) {
      this.saveButton.disabled = false;
      this.saveButton.classList.remove("opacity-80");
    }
  },

  disableSaveButton() {
    if (this.saveButton) {
      this.saveButton.disabled = true;
      this.saveButton.classList.add("opacity-80");
    }
  },

  // Handle save action
  async handleSave() {
    if (!this.editor || this.isDestroyed) {
      console.error("Editor not available");
      return;
    }

    try {
      this.setSaveButtonLoading(true);

      const savedData = await this.editor.save();
      console.log("Saving data...", savedData);

      if (this.isEmptyContent(savedData)) {
        this.handleEmptyContent();
        return;
      }

      // Validate content before sending
      if (!this.validateContent(savedData)) {
        throw new Error("Invalid content format");
      }

      this.pushEvent("save_editor_content", {
        content: savedData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Save failed:", error);
      this.handleSaveError(error);
    } finally {
      this.setSaveButtonLoading(false);
    }
  },

  // Save button loading state
  setSaveButtonLoading(loading) {
    if (this.saveButton) {
      this.saveButton.disabled = loading;
      this.saveButton.textContent = loading ? "Saving..." : "Save";
    }
  },

  // Content validation
  validateContent(data) {
    if (!data || !Array.isArray(data.blocks)) {
      return false;
    }

    // Check for required fields in blocks
    return data.blocks.every(
      (block) =>
        block.type &&
        block.data !== undefined &&
        typeof block.data === "object",
    );
  },

  isEmptyContent(data) {
    return (
      !data.blocks ||
      data.blocks.length === 0 ||
      data.blocks.every(
        (block) =>
          !block.data ||
          (typeof block.data === "object" &&
            Object.keys(block.data).length === 0),
      )
    );
  },

  handleEmptyContent() {
    this.disableSaveButton();
    this.pushEvent("empty_content_warning");
  },

  // LiveView response handlers
  handleContentValidated(response) {
    if (response.valid) {
      console.log("Content validated successfully");
    } else {
      console.error("Content validation failed:", response.errors);
    }
  },

  handleContentSaved(response) {
    console.log("Content saved successfully:", response);
    this.disableSaveButton();
    this.showSuccessMessage("Content saved successfully!");
  },

  handleSaveError(error) {
    console.error("Save error:", error);
    this.showErrorMessage(error.message || "Failed to save content");
  },

  handleEditorError(error) {
    console.error("Editor error:", error);
    this.showErrorMessage("Editor failed to initialize");
  },

  // User feedback
  showSuccessMessage(message) {
    this.pushEvent("show_flash", { type: "success", message });
  },

  showErrorMessage(message) {
    this.pushEvent("show_flash", { type: "error", message });
  },

  // Utility functions
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Cleanup
  cleanup() {
    this.isDestroyed = true;

    // Clear timeouts and intervals
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    if (this.uploadTimeout) {
      clearTimeout(this.uploadTimeout);
    }

    // Reject pending uploads
    if (this.currentUploadReject) {
      this.currentUploadReject(new Error("Component destroyed"));
    }
    this.currentUploadResolve = null;
    this.currentUploadReject = null;

    // Destroy editor
    if (this.editor && typeof this.editor.destroy === "function") {
      this.editor.destroy();
    }

    this.editor = null;
    this.saveButton = null;
  },
};
