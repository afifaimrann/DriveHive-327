file_path=''
chunk_size=16*1024*1024

#Testing the chunking mechanism using python
with open(file_path, 'rb') as file:
    while True:
        chunk = file.read(chunk_size)
        if not chunk:
            break
        print(chunk)
        print(len(chunk))
        print(type(chunk))
        print("----")


#This will be done if the chunking works appropriately
#Trying to save data like number of chunks, also in future about User data
#which could be later used to bring back the file together as well




# with open(file_path, 'rb') as file:
#     chunk_number = 0
#     while True:
#         chunk = file.read(chunk_size)
#         if not chunk:
#             break
#         with open(f'chunk_{chunk_number}', 'wb') as chunk_file:
#             chunk_file.write(chunk)
#         chunk_number += 1    


#Merging the chunks back together after testing is done

# output_file_name = ''
# downloaded_chunks = []
# with open(output_file_name, 'wb') as output_file:
#     for chunk in downloaded_chunks:
#         with open(chunk, 'rb') as chunk_file:
#             output_file.write(chunk_file.read())
