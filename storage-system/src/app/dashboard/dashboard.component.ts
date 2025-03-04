import { ChangeDetectorRef, Component, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { HttpClient, HttpHeaders, HttpEventType } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FileService } from '../file.service'; // Ensure the correct path is used
import { MatIconModule } from '@angular/material/icon';
import { Pipe, PipeTransform } from '@angular/core';
import * as CryptoJS from 'crypto-js';

// Define an interface for UploadedFile
interface UploadedFile {
  filename: string;
  path: string;
  uploadedAt: string;
}

@Pipe({
  name: 'formatFileSize'
})
export class FormatFileSizePipe implements PipeTransform {
  transform(value: number): string {
    if (value < 1024) return `${value} bytes`;
    else if (value < 1048576) return `${(value / 1024).toFixed(2)} KB`;
    else if (value < 1073741824) return `${(value / 1048576).toFixed(2)} MB`;
    else return `${(value / 1073741824).toFixed(2)} GB`;
  }
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormatFileSizePipe], // Include the pipe here
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements AfterViewInit {
  @ViewChild('fileInput') fileInput: ElementRef | undefined;

  uploadedFiles: File[] = [];
  filePreviews: { file: File; preview: string | ArrayBuffer | null }[] = [];
  progress: number = 0;
  uploading: boolean = false;
  files: UploadedFile[] = [];
  canceledFiles: string[] = [];
  isDragOver: boolean = false; // New property for drag over state
  uploadErrorMessage: string | null = null; // New property for upload error message

  isPdf(file: File): boolean {
    return file.type === 'application/pdf';
  }

  isWord(file: File): boolean {
    return file.type === 'application/msword' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  isVideo(file: File): boolean {
    return file.type.startsWith('video/');
  }

  isExcel(file: File): boolean {
    return file.type === 'application/vnd.ms-excel' || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  isZip(file: File): boolean {
    return file.type === 'application/zip' || file.name.endsWith('.zip');
  }

  // New property to track the file being uploaded
  currentUploadingIndex: number = -1;

  // New property to track file upload progress
  fileProgress: { [key: string]: number } = {};

  uploadedFileName: string = ''; // To track the uploaded file name
  uploadCompleteMessage: string = '';

  constructor(private http: HttpClient, private fileService: FileService, private cdRef: ChangeDetectorRef) {
    this.fetchUploadedFiles();
  }

  ngAfterViewInit(): void {
    // No usage chart initialization
  }

  // Update the fetchUploadedFiles method with type safety
  fetchUploadedFiles(): void {
    this.http.get<{ files: UploadedFile[] }>('http://localhost:3000/files').subscribe(
      (data) => {
        console.log(data); // Log the fetched data for debugging
        this.files = this.filterFilesUploadedToday(data.files);
        this.cdRef.detectChanges(); // Ensure change detection is called
      },
      (error) => {
        console.error('Error fetching files:', error);
      }
    );
  }

  filterFilesUploadedToday(files: UploadedFile[]): UploadedFile[] {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));  // Set time to 00:00:00
    const endOfToday = new Date(today.setHours(23, 59, 59, 999)); // Set time to 23:59:59

    return files.filter((file) => {
      const uploadedAt = new Date(file.uploadedAt);
      return uploadedAt >= startOfToday && uploadedAt <= endOfToday;  // Check if within today's range
    });
  }

  onFilesSelected(event: any): void {
    const files: File[] = Array.from(event.target.files);
    this.addFilesWithUniqueKeys(files);
    this.cdRef.detectChanges(); // Trigger change detection to update the view
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files) {
      const files: File[] = Array.from(event.dataTransfer.files);
      this.addFilesWithUniqueKeys(files);
      this.cdRef.detectChanges(); // Trigger change detection to update the view
    }
  }
  

  addFilesWithUniqueKeys(files: File[]): void {
    files.forEach((file, index) => {
      let uniqueKey = file.name;
      let fileIndex = 1;
  
      // Check if the file already exists in the uploaded files and also check for canceled files
      while (this.uploadedFiles.some(f => f.name === uniqueKey) || this.isCanceledFile(uniqueKey)) {
        const nameWithoutExtension = file.name.substring(0, file.name.lastIndexOf('.'));
        const extension = file.name.substring(file.name.lastIndexOf('.'));
        uniqueKey = `${nameWithoutExtension} (${fileIndex})${extension}`;
        fileIndex++;
      }
  
      // Create a new file with the unique key
      const newFile = new File([file], uniqueKey, { type: file.type });
      this.uploadedFiles.push(newFile);
      this.generatePreview(newFile);
    });
  }
  
  // Helper function to check if a file name was previously canceled
  cancelFileUpload(fileName: string): void {
    this.canceledFiles.push(fileName);
  }
  
  // Helper function to check if a file was previously canceled
  isCanceledFile(fileName: string): boolean {
    return this.canceledFiles.includes(fileName);
  }
  
  
  

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true; // Set drag over state to true
  }

  onDragLeave(event: DragEvent): void {
    this.isDragOver = false; // Set drag over state to false
  }

  generatePreview(file: File): void {
    const reader = new FileReader();
    if (file.type.startsWith('image')) {
      reader.onload = () => {
        this.filePreviews.push({ file, preview: reader.result });
        this.cdRef.detectChanges();  // Update UI after preview is generated
      };
      reader.readAsDataURL(file);
    } else if (file.type === 'application/pdf') {
      this.filePreviews.push({ file, preview: 'assets/pdf-icon.png' });
      this.cdRef.detectChanges();  // Ensure the preview is updated
    } else {
      this.filePreviews.push({ file, preview: null });
      this.cdRef.detectChanges();
    }
  }
  

  // Upload files one by one
  uploadFiles(): void {
  if (this.uploadedFiles.length === 0) return;

  this.uploading = true;
  this.uploadNextFile(0);  // Start with the first file
}
finalizeFileName(newFileName: string): void {
  // Once the new file name is confirmed, update the current file's name.
  if (this.currentUploadingIndex >= 0 && this.currentUploadingIndex < this.uploadedFiles.length) {
    const currentFile = this.uploadedFiles[this.currentUploadingIndex];
    const newFile = new File([currentFile], newFileName, { type: currentFile.type });
    
    // Replace the file with the new name in the array
    this.uploadedFiles[this.currentUploadingIndex] = newFile;
  }
}


// Check for duplicate file names and handle renaming
checkForDuplicateFileName(fileName: string): void {
  this.http.get<{ existingFiles: string[] }>('http://localhost:3000/files/existing')
    .subscribe((response) => {
      let newFileName = fileName;
      let fileIndex = 1;
      
      const nameWithoutExtension = fileName.substring(0, fileName.lastIndexOf('.'));
      const extension = fileName.substring(fileName.lastIndexOf('.'));

      // Combine local uploaded file names with those fetched from the backend
      const allUploadedFileNames = [...this.uploadedFileNames, ...response.existingFiles];

      // Check if the file name already exists
      while (allUploadedFileNames.includes(newFileName)) {
        newFileName = `${nameWithoutExtension}(${fileIndex})${extension}`;
        fileIndex++;
      }

      // Update the file name with the unique version
      this.finalizeFileName(newFileName);
    });
}


  // Array to hold the names of all uploaded files
  uploadedFileNames: string[] = [];

  // Upload the next file in the queue
  uploadNextFile(index: number): void {
    if (index >= this.uploadedFiles.length) {
        this.uploading = false;
        this.fetchUploadedFiles();
        this.resetUpload();
        // Optionally reset after all uploads, but leave previews intact
        return;
    }

    const file = this.uploadedFiles[index];
    this.fileProgress[file.name] = 0;
    this.currentUploadingIndex = index;

    // Upload the file to the server
    this.uploadFileToServer(file, index);
  }

  // Actual server upload logic for all files
  uploadFileToServer(file: File, index: number): void {
    const formData = new FormData();
  
    // Ensure the file uses the checked duplicate-free name
    formData.append('files', file, file.name);
  
    this.fileProgress[file.name] = 0;
    const startTime = Date.now();
  
    this.http.post('http://localhost:3000/upload', formData, {
      headers: new HttpHeaders(),
      observe: 'events',
      reportProgress: true
    }).subscribe(
      (event: any) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          const progress = Math.round(100 * event.loaded / event.total);
          this.fileProgress[file.name] = progress;
          this.cdRef.detectChanges();
        } else if (event.type === HttpEventType.Response) {
          const response = event.body as { files: { filename: string }[] };
          const uploadedFileNames = response.files.map(f => f.filename) || [];
          this.uploadedFileNames.push(...uploadedFileNames);
  
          // Ensure a minimum display time for the progress bar
          const elapsedTime = Date.now() - startTime;
          const minimumDisplayTime = 500; // 500 ms minimum display time
  
          setTimeout(() => {
            this.uploadNextFile(index + 1);
          }, Math.max(minimumDisplayTime - elapsedTime, 0));
        }
      },
      (error) => {
        console.error('Upload error:', error);
        this.uploadErrorMessage = 'There was an error uploading the file.'; // Set error message on upload failure
        this.uploadNextFile(index + 1); // Continue with the next file even on error
      }
    );
  }
  
  removeFile(index: number): void {
    this.uploadedFiles.splice(index, 1); // Remove file from the list
    this.filePreviews.splice(index, 1); // Remove the corresponding preview
    this.cdRef.detectChanges(); // Trigger change detection to update the view
  }
  

  // Reset the upload state
  resetUpload(): void {
    
    this.uploadedFiles = [];
    this.filePreviews = [];
    this.fileProgress = {};
    this.uploadedFileName = '';
    this.uploadCompleteMessage = '';
    this.cdRef.detectChanges();
  }
}
