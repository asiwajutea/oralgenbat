</TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="mt-4">
                  <AuditPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalCount={sortedResults.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={handlePageChange}
                    onItemsPerPageChange={handleItemsPerPageChange}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Single Delete Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Corrupted ZIP?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the corrupted ZIP file for <strong>{selectedAudit?.file_name}</strong> along with any partial data. 
                The interview record will remain but you'll need to re-upload the mobile data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedAudit && deleteZipMutation.mutate(selectedAudit)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteZipMutation.isPending}
              >
                {deleteZipMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Bulk Delete Dialog */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selectedItems.size} Corrupted ZIPs?</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete the selected corrupted ZIP files and their partial data. 
                Interview records will remain but mobile data will need to be re-uploaded.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Delete {selectedItems.size} Files
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default ZipDiagnostics;