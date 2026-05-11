import React from 'react';
import {
  CourseDashboardHeader,
  CourseDashboardPrimaryButton,
  MutedText,
  PageContainer,
  PageStack,
  SurfaceCard,
  dashboardPalette,
} from '../components/CourseDashboardUI';

export default function LoggedOut() {
  return (
    <PageContainer maxWidth="640px">
      <PageStack>
        <CourseDashboardHeader
          title="Signed out"
          subtitle="Your session has ended."
        />

        <SurfaceCard style={{ textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '1.2rem', color: dashboardPalette.navy }}>You have successfully logged out of Caliber</h2>
          <MutedText style={{ marginBottom: '24px' }}>
            You can return to the UCSB Caliber homepage whenever you are ready.
          </MutedText>
          <CourseDashboardPrimaryButton
            onClick={() => {
              window.location.assign('https://app.caliber.cs.ucsb.edu/');
            }}
          >
            Return to homepage
          </CourseDashboardPrimaryButton>
        </SurfaceCard>
      </PageStack>
    </PageContainer>
  );
}
