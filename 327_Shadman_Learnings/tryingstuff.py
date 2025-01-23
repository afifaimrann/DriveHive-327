#* 23-01-2025
# This is a further modified take on locally chunking and saving them to a file
# then later taking those chunks from the local spot with
# relevant metadata i.e. the file name to bring them back together.
# Work will be done further to have a metadata like hashes to secure the 
# combining of the files even further.*#


import os

file_path = '/Users/shadman/Downloads/mfcc_data4.json' #Tried also with jpg, pdf, txt, docx. Should work with any file type
chunk_size = 16 * 1024 * 1024  # 16 MB
chunk_dir = '/Users/shadman/Downloads/Chunks'
os.makedirs(chunk_dir, exist_ok=True)  #Make a directory if it already doesn't exist, for the chunks
file_extension = os.path.splitext(file_path)[1]
file_name_with_ext = os.path.basename(file_path)   #Get the file name with extension
file_name_without_ext = os.path.splitext(file_name_with_ext)[0]   #Get the file name without extension

#--------------------------
#print(file_name_with_ext)
#print(file_name_without_ext)
#print(file_extension)
#--------------------------


#Where the breaking down of files happen
with open(file_path, 'rb') as file:
    chunk_number = 0 #for now, we are maintaining a chunk number for ease of merging
    while True:
        chunk = file.read(chunk_size) #16MB chunks
        if not chunk:
            break
        chunk_file_path = os.path.join(chunk_dir, f'{file_name_without_ext}_chunk_{chunk_number}') #naming the chunks with respect to original file name
        with open(chunk_file_path, 'wb') as chunk_file:
            chunk_file.write(chunk)
        chunk_number += 1 #We can later use chunk number as metadata to merge the files

print(f"File successfully chunked into {chunk_number} parts")



#------------------------------------
#Where the merging of files happen

reconstructed_file_path = f'/Users/shadman/Downloads/Reconstruct_{file_name_without_ext}{file_extension}' #For ease, done locally at first to test
with open(reconstructed_file_path, 'wb') as output_file:
    for chunk_number in range(chunk_number):  
        chunk_file_path = os.path.join(chunk_dir, f'{file_name_without_ext}_chunk_{chunk_number}') #Could be made better with hashes and more metadata for files
        with open(chunk_file_path, 'rb') as chunk_file:
            output_file.write(chunk_file.read()) #writing back the chunks to the original file in the same order

print("Chunks successfully merged")
